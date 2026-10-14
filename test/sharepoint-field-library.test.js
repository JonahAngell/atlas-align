import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import vm from "node:vm";
import ExcelJS from "exceljs";
import { FIELD_LIBRARY_COLUMNS } from "../src/00-global-variables.js";
import { CsvValidationError } from "../src/field-library.js";
import { parseFieldLibraryWorkbook } from "../src/field-library-workbook.js";
import { loadLiveFieldLibrary } from "../src/field-library-source.js";
import { loadEnvFile } from "../src/load-env.js";
import {
  SharePointError,
  readSharePointConfig,
  readSharePointWorkbook,
  resetSharePointState,
} from "../src/sharepoint-client.js";

const mkdtempAsync = promisify(mkdtemp);
const SECRET = "super-secret-value-xyz";
const ENV_KEYS = [
  "SP_TENANT_ID",
  "SP_CLIENT_ID",
  "SP_CLIENT_SECRET",
  "SP_HOST",
  "SP_SITE",
  "SP_FOLDER",
  "SP_FILE",
  "SP_SHEET",
  "SP_CACHE_SECONDS",
];

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    arrayBuffer: async () => new ArrayBuffer(0),
  };
}

function bytesResponse(bytes, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => ({}),
    arrayBuffer: async () => Uint8Array.from(bytes).buffer,
  };
}

function applySharePointEnv(overrides = {}) {
  const values = {
    SP_TENANT_ID: "tenant-1",
    SP_CLIENT_ID: "client-1",
    SP_CLIENT_SECRET: SECRET,
    SP_HOST: "contoso.sharepoint.com",
    SP_SITE: "MyTeam",
    SP_FOLDER: "Reports/Q1 Files",
    SP_FILE: "catalog.xlsx",
    SP_SHEET: "",
    SP_CACHE_SECONDS: "300",
    ...overrides,
  };
  for (const key of ENV_KEYS) {
    if (values[key]) process.env[key] = values[key];
    else delete process.env[key];
  }
}

test("environment loader does not override or echo values", async () => {
  const directory = await mkdtempAsync(path.join(tmpdir(), "atlas-env-"));
  const file = path.join(directory, ".env");
  writeFileSync(
    file,
    `# comment\nKEEP_ME=original\nNEW_VALUE=${SECRET}\n\nBAD LINE\n`,
  );
  process.env.KEEP_ME = "original";
  delete process.env.NEW_VALUE;
  const logs = [];
  const original = console.log;
  console.log = (...args) => logs.push(args.join(" "));
  try {
    loadEnvFile(file);
    assert.equal(process.env.KEEP_ME, "original");
    assert.equal(process.env.NEW_VALUE, SECRET);
    assert.equal(
      logs.some((line) => line.includes(SECRET)),
      false,
    );
  } finally {
    console.log = original;
    delete process.env.KEEP_ME;
    delete process.env.NEW_VALUE;
  }
});

test.describe("SharePoint client", { concurrency: false }, () => {
  const previous = new Map(ENV_KEYS.map((key) => [key, process.env[key]]));

  test.afterEach(() => {
    for (const key of ENV_KEYS) {
      const value = previous.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    resetSharePointState();
  });

  test("missing configuration does not call Graph", async () => {
    for (const key of ENV_KEYS) delete process.env[key];
    let called = false;
    const result = await readSharePointWorkbook({
      fetchImpl: async () => {
        called = true;
        return jsonResponse({});
      },
    });
    assert.equal(result.outcome, "not_configured");
    assert.equal(called, false);
    assert.equal(readSharePointConfig().configured, false);
  });

  test("encodes the file path and caches token, file, and reload", async () => {
    applySharePointEnv();
    const calls = [];
    let etag = '"etag-1"';
    const content = Buffer.from("workbook-one");
    const fetchImpl = async (url, options = {}) => {
      calls.push({ url: String(url), method: options.method || "GET" });
      const href = String(url);
      if (href.includes("/oauth2/v2.0/token")) {
        return jsonResponse({ access_token: "token-1", expires_in: 3600 });
      }
      if (href.includes("/sites/contoso.sharepoint.com:/sites/MyTeam")) {
        return jsonResponse({ id: "site-1" });
      }
      if (href.endsWith(":/content")) return bytesResponse(content);
      if (href.includes("/drive/root:/")) return jsonResponse({ eTag: etag });
      return jsonResponse({}, 404);
    };
    let now = 1_000_000;
    const first = await readSharePointWorkbook({ fetchImpl, now: () => now });
    assert.equal(first.outcome, "reloaded");
    assert.equal(Buffer.compare(first.bytes, content), 0);
    assert.ok(
      calls.some((call) =>
        call.url.endsWith(
          "/sites/site-1/drive/root:/Reports/Q1%20Files/catalog.xlsx:",
        ),
      ),
    );
    assert.ok(
      calls.some((call) =>
        call.url.endsWith(
          "/sites/site-1/drive/root:/Reports/Q1%20Files/catalog.xlsx:/content",
        ),
      ),
    );

    const afterFirst = calls.length;
    now += 1_000;
    const cached = await readSharePointWorkbook({ fetchImpl, now: () => now });
    assert.equal(cached.outcome, "cached");
    assert.equal(calls.length, afterFirst);

    now += 301_000;
    const reloaded = await readSharePointWorkbook({
      fetchImpl,
      now: () => now,
    });
    assert.equal(reloaded.outcome, "reloaded");
    assert.equal(
      calls.filter((call) => call.url.endsWith(":/content")).length,
      1,
    );

    etag = '"etag-2"';
    const changed = Buffer.from("workbook-two");
    const fetchChanged = async (url, options = {}) => {
      const href = String(url);
      if (href.endsWith(":/content")) return bytesResponse(changed);
      return fetchImpl(url, options);
    };
    now += 301_000;
    const updated = await readSharePointWorkbook({
      fetchImpl: fetchChanged,
      now: () => now,
    });
    assert.equal(updated.outcome, "reloaded");
    assert.equal(Buffer.compare(updated.bytes, changed), 0);
  });

  test("token failure names the status and omits the secret", async () => {
    applySharePointEnv();
    const logs = [];
    const original = console.error;
    console.error = (...args) => logs.push(args.map(String).join(" "));
    try {
      await assert.rejects(
        () =>
          readSharePointWorkbook({
            fetchImpl: async () => jsonResponse({ error: SECRET }, 401),
          }),
        (error) => {
          assert.equal(error instanceof SharePointError, true);
          assert.equal(error.message, "Token request failed (401)");
          assert.equal(error.message.includes(SECRET), false);
          assert.equal(JSON.stringify(error).includes(SECRET), false);
          return true;
        },
      );
      assert.equal(
        logs.some((line) => line.includes(SECRET)),
        false,
      );
    } finally {
      console.error = original;
    }
  });
});

function dataRow(id, source = "sap.hi0256") {
  return FIELD_LIBRARY_COLUMNS.map((column) => {
    if (column === "ID") return id;
    if (column === "Current Source") return source;
    if (column === "Current Source: Title") return "HI0256";
    return "";
  });
}

async function workbookBuffer({
  sheetName = "Field Library",
  headers = FIELD_LIBRARY_COLUMNS,
  rows = [dataRow("15")],
  leadingSheet = false,
  numericId = false,
} = {}) {
  const workbook = new ExcelJS.Workbook();
  if (leadingSheet) {
    const notes = workbook.addWorksheet("Notes");
    notes.addRow(["Not the field library"]);
  }
  const sheet = workbook.addWorksheet(sheetName);
  sheet.addRow([...headers]);
  rows.forEach((row) => sheet.addRow(row));
  sheet.addRow([]);
  if (numericId) {
    sheet.getRow(2).getCell(FIELD_LIBRARY_COLUMNS.indexOf("ID") + 1).value = 15;
  }
  const written = await workbook.xlsx.writeBuffer();
  return Buffer.from(written);
}

test("workbook parser keeps the field-library contract", async () => {
  const parsed = await parseFieldLibraryWorkbook(
    await workbookBuffer({ leadingSheet: true, numericId: true }),
  );
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.headers[10], "Sample Value 1 ");
  assert.equal(parsed.rows[0][FIELD_LIBRARY_COLUMNS.indexOf("ID")], "15");
  assert.equal(parsed.sha256.length, 64);

  const named = await parseFieldLibraryWorkbook(
    await workbookBuffer({ sheetName: "Library" }),
    { sheetName: "Library" },
  );
  assert.equal(named.rows.length, 1);

  const missingSheet = await workbookBuffer();
  await assert.rejects(
    () =>
      parseFieldLibraryWorkbook(missingSheet, {
        sheetName: "Missing",
      }),
    (error) => {
      assert.equal(error instanceof CsvValidationError, true);
      assert.match(error.message, /configured field-library sheet/);
      return true;
    },
  );

  const badHeaders = [...FIELD_LIBRARY_COLUMNS];
  badHeaders[10] = "Sample Value 1";
  const mismatched = await workbookBuffer({
    headers: badHeaders,
    sheetName: "Field Library",
  });
  await assert.rejects(
    () => parseFieldLibraryWorkbook(mismatched),
    /field-library sheet/,
  );
  await assert.rejects(
    () => parseFieldLibraryWorkbook(mismatched, { sheetName: "Field Library" }),
    /header mismatch/,
  );
});

test.describe("field library reload", { concurrency: false }, () => {
  test("copies every reload and serves backup after an outage", async () => {
    const bytes = await workbookBuffer();
    const stored = [];
    let copies = 0;
    let reads = 0;
    const download = (() => {
      const steps = [
        { outcome: "reloaded", bytes, fileName: "catalog.xlsx", sheetName: "" },
        { outcome: "reloaded", bytes, fileName: "catalog.xlsx", sheetName: "" },
        { outcome: "cached", bytes, fileName: "catalog.xlsx", sheetName: "" },
        {
          throw: new SharePointError(
            "SharePoint workbook unavailable (HTTP 503)",
          ),
        },
      ];
      return async () => {
        const step = steps.shift();
        if (step.throw) throw step.throw;
        return step;
      };
    })();
    const replaceLibrary = async (_pool, options) => {
      copies += 1;
      stored.splice(
        0,
        stored.length,
        ...options.parsed.rows.map((row) => {
          const record = {};
          options.parsed.headers.forEach((header, index) => {
            record[header] = row[index];
          });
          return record;
        }),
      );
      assert.equal(options.importedBy, "sharepoint");
      assert.equal(options.originalFileName, "catalog.xlsx");
    };
    const readRows = async () => {
      reads += 1;
      return stored.map((row) => ({ ...row }));
    };
    const options = { downloadWorkbook: download, replaceLibrary, readRows };

    const first = await loadLiveFieldLibrary({}, options);
    const second = await loadLiveFieldLibrary({}, options);
    const cached = await loadLiveFieldLibrary({}, options);
    assert.equal(first.state, "live");
    assert.equal(second.state, "live");
    assert.equal(cached.state, "live");
    assert.equal(copies, 2);
    assert.equal(stored.length, 1);
    assert.equal(reads, 0);
    assert.equal(first.rows[0].ID, "15");

    const outage = await loadLiveFieldLibrary({}, options);
    assert.equal(outage.state, "backup");
    assert.equal(
      outage.detail,
      "SharePoint workbook unavailable. Saved field library.",
    );
    assert.equal(outage.rows[0].ID, "15");
    assert.equal(reads, 1);
  });

  test("uses backup rows when the workbook is invalid and unavailable when backup is empty", async () => {
    const backup = [
      {
        ...Object.fromEntries(
          FIELD_LIBRARY_COLUMNS.map((column) => [
            column,
            column === "ID"
              ? "9"
              : column === "Current Source"
                ? "sap.backup"
                : "",
          ]),
        ),
      },
    ];
    const invalid = await loadLiveFieldLibrary(
      {},
      {
        downloadWorkbook: async () => ({
          outcome: "reloaded",
          bytes: Buffer.from("not-a-workbook"),
          fileName: "catalog.xlsx",
          sheetName: "",
        }),
        replaceLibrary: async () => {
          throw new Error("replace should not run");
        },
        readRows: async () => backup,
      },
    );
    assert.equal(invalid.state, "backup");
    assert.equal(
      invalid.detail,
      "SharePoint workbook could not be read. Saved field library.",
    );
    assert.equal(invalid.rows[0].ID, "9");

    const empty = await loadLiveFieldLibrary(
      {},
      {
        downloadWorkbook: async () => {
          throw new SharePointError(
            "SharePoint workbook unavailable (HTTP 503)",
          );
        },
        readRows: async () => [],
      },
    );
    assert.equal(empty.state, "unavailable");
    assert.deepEqual(empty.rows, []);

    const unreadable = await loadLiveFieldLibrary(
      {},
      {
        downloadWorkbook: async () => ({ outcome: "not_configured" }),
        readRows: async () => null,
      },
    );
    assert.equal(unreadable.state, "unavailable");
  });
});

test("Sources lightboard exposes live, backup, and unavailable", () => {
  const html = readFileSync(
    new URL("../sections/sources.html", import.meta.url),
    "utf8",
  );
  assert.match(html, /id="fieldLibraryLightboard"/);
  assert.match(html, /data-lamp="live"/);
  assert.match(html, /data-lamp="backup"/);
  assert.match(html, /data-lamp="unavailable"/);
  assert.match(html, /Checking field library source/);

  const lamps = ["live", "backup", "unavailable"].map((name) => ({
    dataset: { lamp: name },
    classList: {
      lit: false,
      toggle(className, on) {
        if (className === "is-lit") this.lit = on;
      },
    },
  }));
  const detail = { textContent: "" };
  const root = {
    dataset: {},
    querySelectorAll() {
      return lamps;
    },
  };
  const sandbox = {
    repoLibraryState: { fieldLibraryProvenance: null },
    $(id) {
      if (id === "fieldLibraryLightboard") return root;
      if (id === "fieldLibraryLightboardText") return detail;
      return null;
    },
  };
  vm.createContext(sandbox);
  const source = readFileSync(
    new URL("../js/17-source-database.js", import.meta.url),
    "utf8",
  );
  const start = source.indexOf("function atlasRenderFieldLibraryLightboard");
  vm.runInContext(source.slice(start), sandbox);
  sandbox.atlasRenderFieldLibraryLightboard();
  assert.equal(root.dataset.state, "checking");
  assert.equal(detail.textContent, "Checking field library source");
  assert.equal(
    lamps.some((lamp) => lamp.classList.lit),
    false,
  );

  sandbox.repoLibraryState.fieldLibraryProvenance = {
    state: "live",
    detail: "SharePoint workbook loaded.",
  };
  sandbox.atlasRenderFieldLibraryLightboard();
  assert.equal(root.dataset.state, "live");
  assert.equal(lamps[0].classList.lit, true);
  assert.equal(lamps[1].classList.lit, false);
  assert.equal(detail.textContent, "SharePoint workbook loaded.");
});
