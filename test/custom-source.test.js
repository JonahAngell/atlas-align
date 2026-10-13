import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import express from "express";
import {
  allocateCustomSourceKey,
  CUSTOM_FIELD_FORMATS,
  customSourceCreator,
  customSourceFromRecord,
  CustomSourceValidationError,
  mergeCustomSources,
  validateCustomSourceInput,
} from "../src/custom-source.js";
import { insertCustomSource } from "../src/custom-source-repository.js";
import { createSourceLibraryRouter } from "../src/routes/source-library-routes.js";
import { sourceLibraryFromRows } from "../src/source-library.js";

const workbookRow = {
  "Current Source": "wd.sample",
  "Current Source: Title": "Workbook Source",
  "Source Field Name": "Worker",
  ID: "1",
};

function fakePool() {
  const queries = [];
  const client = {
    async query(text, params) {
      queries.push({ text, params });
      return { rows: [{ id: params?.[0], source_key: params?.[0] }] };
    },
    release() {},
  };
  return {
    queries,
    pool: {
      connect: async () => client,
      query: (text, params) => client.query(text, params),
    },
  };
}

function customLibrarySource() {
  return {
    version: 2,
    sourceKey: "custom.bonus-file",
    sourceFile: "Bonus File",
    alias: "custom.bonus-file",
    origin: "custom",
    createdBy: {
      id: "user-1",
      username: "ada",
      fullName: "Ada Lovelace",
      avatar: null,
    },
    fields: [{ id: "field-1", fieldName: "Amount" }],
    fieldCount: 1,
  };
}

async function withSourceLibraryApp(overrides, run) {
  const inserted = [];
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.studioshareUser = {
      id: "user-1",
      username: "ada",
      fullName: "Ada Lovelace",
    };
    next();
  });
  app.use(
    createSourceLibraryRouter({
      requireCurrentUser: (_req, _res, next) => next(),
      sourceLibraryAccessDecision: () => ({
        allowed: false,
        reason: "required_role_absent",
      }),
      loadLiveFieldLibrary: async () => ({ rows: [workbookRow], state: "live" }),
      sourceLibraryFromRows,
      fieldLibraryProvenance: () => ({
        state: "live",
        label: "Live",
        detail: "SharePoint workbook loaded.",
      }),
      pool: {},
      listCustomSourceKeys: async () => [],
      listCustomSources: async () => [customLibrarySource()],
      insertCustomSource: async (_pool, record) => {
        inserted.push(record);
        return {
          origin: "custom",
          sourceKey: record.sourceKey,
          createdBy: record.createdBy,
        };
      },
      ...overrides,
    }),
  );
  const server = await new Promise((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  const { port } = server.address();
  try {
    await run({ port, inserted });
  } finally {
    server.closeAllConnections?.();
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

function loadCustomSourceBadge() {
  const source = readFileSync(
    new URL("../js/15b-source-library-ui.js", import.meta.url),
    "utf8",
  );
  const start = source.indexOf("function atlasSafeAvatarUrl(");
  const end = source.indexOf("function atlasSourceLibraryPill(");
  assert.notEqual(start, -1);
  assert.ok(end > start);
  const sandbox = {
    esc: (value) =>
      String(value ?? "").replace(
        /[&<>"']/g,
        (character) =>
          ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;",
          })[character],
      ),
  };
  vm.createContext(sandbox);
  vm.runInContext(
    `${source.slice(start, end)}
this.api = {
  atlasCustomSourceBadge,
  atlasCustomSourceAvatarFallback,
  atlasCustomSourceInitials,
};`,
    sandbox,
  );
  return sandbox.api;
}

test("custom source validation rejects an unknown field format", () => {
  assert.throws(
    () =>
      validateCustomSourceInput({
        sourceName: "Bonus File",
        fields: [{ vanityLabel: "Amount", fieldFormat: "Freeform" }],
      }),
    (error) => {
      assert.ok(error instanceof CustomSourceValidationError);
      assert.match(error.message, /Field 1 format must be one of/);
      return true;
    },
  );
});

test("custom source key avoids catalog and custom collisions", () => {
  assert.equal(
    allocateCustomSourceKey("Bonus File", ["wd.sample"]),
    "custom.bonus-file",
  );
  assert.equal(
    allocateCustomSourceKey("Bonus File", ["custom.bonus-file", "wd.sample"]),
    "custom.bonus-file-2",
  );
});

test("creator name comes from the signed-in user", () => {
  assert.deepEqual(
    customSourceCreator({
      id: "user-1",
      username: "ada",
      fullName: "Ada Lovelace",
    }),
    { id: "user-1", username: "ada", fullName: "Ada Lovelace" },
  );
  assert.equal(
    customSourceCreator({ id: "user-2", username: "ada", fullName: "  " })
      .fullName,
    "ada",
  );
});

test("insert stores the session user's full name", async () => {
  const { pool, queries } = fakePool();
  const input = validateCustomSourceInput({
    sourceName: "Bonus File",
    sourceSystem: "Payroll",
    fields: [
      {
        vanityLabel: "Amount",
        fieldFormat: "Currency",
        businessDescription: "Paid amount",
      },
    ],
  });
  const created = await insertCustomSource(pool, {
    sourceKey: "custom.bonus-file",
    input,
    createdBy: customSourceCreator({
      id: "user-1",
      username: "ada",
      fullName: "Ada Lovelace",
    }),
  });
  const sourceInsert = queries.find((query) =>
    query.text.includes("INSERT INTO atlas_custom_sources"),
  );
  assert.ok(sourceInsert);
  assert.deepEqual(sourceInsert.params.slice(1), [
    "custom.bonus-file",
    "Bonus File",
    "Payroll",
    "user-1",
    "ada",
    "Ada Lovelace",
  ]);
  const fieldInsert = queries.find((query) =>
    query.text.includes("INSERT INTO atlas_custom_source_fields"),
  );
  assert.equal(fieldInsert.params[5], "Currency");
  assert.equal(created.createdBy.fullName, "Ada Lovelace");
  assert.equal(created.origin, "custom");
  assert.equal(created.fields[0].fieldFormat, "Currency");
});

test("custom sources merge beside workbook sources", () => {
  const catalog = sourceLibraryFromRows([workbookRow]);
  const custom = customSourceFromRecord({
    source_key: "custom.bonus-file",
    source_name: "Bonus File",
    source_system: "",
    created_by_user_id: "user-1",
    created_by_username: "ada",
    created_by_full_name: "Ada Lovelace",
    avatar_url: "javascript:alert(1)",
    fields: [
      {
        id: "field-1",
        field_order: 1,
        field_name: "Amount",
        vanity_label: "Amount",
        field_format: "Currency",
        business_description: "",
      },
    ],
  });
  assert.equal(custom.createdBy.avatar, null);
  const merged = mergeCustomSources(catalog, [
    custom,
    { ...custom, sourceKey: "wd.sample", sourceFile: "Workbook Source" },
  ]);
  assert.deepEqual(
    merged.map((source) => source.sourceKey),
    ["custom.bonus-file", "wd.sample"],
  );
  assert.equal(
    merged.find((source) => source.sourceKey === "wd.sample").fields[0]
      .fieldName,
    "Worker",
  );
});

test("source library routes keep workbook sources and the session creator", async () => {
  await withSourceLibraryApp({}, async ({ port, inserted }) => {
    const listed = await fetch(`http://127.0.0.1:${port}/api/source-library`);
    assert.equal(listed.status, 200);
    const library = await listed.json();
    assert.deepEqual(
      library.sources.map((source) => source.sourceKey),
      ["custom.bonus-file", "wd.sample"],
    );
    assert.equal(library.fieldCount, 2);
    assert.equal(library.provenance.state, "live");

    const rejected = await fetch(
      `http://127.0.0.1:${port}/api/source-library/custom`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sourceName: "Bonus File",
          createdBy: { fullName: "Mallory" },
          fields: [{ vanityLabel: "Amount", fieldFormat: "Freeform" }],
        }),
      },
    );
    assert.equal(rejected.status, 400);
    assert.match(await rejected.text(), /Field 1 format must be one of/);
    assert.equal(inserted.length, 0);

    const created = await fetch(
      `http://127.0.0.1:${port}/api/source-library/custom`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sourceName: "Bonus File",
          createdBy: { fullName: "Mallory" },
          fields: [{ displayName: "Amount", fieldFormat: "Currency" }],
        }),
      },
    );
    assert.equal(created.status, 201);
    const payload = await created.json();
    assert.equal(payload.createdBy.fullName, "Ada Lovelace");
    assert.equal(inserted[0].createdBy.fullName, "Ada Lovelace");
    assert.equal(inserted[0].createdBy.username, "ada");
    assert.equal(inserted[0].sourceKey, "custom.bonus-file");
    assert.equal(inserted[0].input.fields[0].fieldName, "Amount");
  });
});

test("custom source badge shows the creator name and initials", () => {
  const { atlasCustomSourceBadge, atlasCustomSourceAvatarFallback } =
    loadCustomSourceBadge();
  const withoutPicture = atlasCustomSourceBadge({
    origin: "custom",
    createdBy: { fullName: "Ada Lovelace", avatar: null },
  });
  assert.match(withoutPicture, /source-inclusion-badge custom">Custom</);
  assert.match(withoutPicture, /aria-label="Ada Lovelace"/);
  assert.match(withoutPicture, /role="tooltip">Ada Lovelace</);
  assert.match(withoutPicture, />AL</);
  assert.equal(withoutPicture.includes("<img"), false);

  const withPicture = atlasCustomSourceBadge({
    origin: "custom",
    createdBy: {
      fullName: "Ada Lovelace",
      avatar: "https://example.test/ada.png",
    },
  });
  assert.match(withPicture, /src="https:\/\/example.test\/ada.png"/);
  assert.match(withPicture, />AL</);

  const unsafe = atlasCustomSourceBadge({
    origin: "custom",
    createdBy: { fullName: "Ada Lovelace", avatar: "javascript:alert(1)" },
  });
  assert.equal(unsafe.includes("<img"), false);

  const image = { removed: false, remove() { this.removed = true; } };
  atlasCustomSourceAvatarFallback(image);
  assert.equal(image.removed, true);
  assert.equal(atlasCustomSourceBadge({ origin: "catalog" }), "");
});

test("the custom source form offers the server field formats", () => {
  const source = readFileSync(
    new URL("../js/17-source-database.js", import.meta.url),
    "utf8",
  );
  const match = source.match(/const CUSTOM_FIELD_FORMATS = (\[[\s\S]*?\]);/);
  assert.ok(match);
  const formats = vm.runInNewContext(match[1]);
  assert.equal(formats.join("\n"), CUSTOM_FIELD_FORMATS.join("\n"));
});
