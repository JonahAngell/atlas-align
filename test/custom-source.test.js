import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import express from "express";
import {
  allocateCustomSourceKey,
  canManageCustomSource,
  CUSTOM_FIELD_FORMATS,
  customSourceCreator,
  customSourceFromRecord,
  customSourceKeyParam,
  CustomSourceValidationError,
  fieldNameFromDisplayName,
  mergeCustomSources,
  validateCustomSourceInput,
} from "../src/custom-source.js";
import {
  deleteCustomSource,
  insertCustomSource,
  updateCustomSource,
} from "../src/custom-source-repository.js";
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
      loadLiveFieldLibrary: async () => ({
        rows: [workbookRow],
        state: "live",
      }),
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

  const image = {
    removed: false,
    remove() {
      this.removed = true;
    },
  };
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

test("display names accept special characters", () => {
  const input = validateCustomSourceInput({
    sourceName: "Bonus File",
    fields: [{ vanityLabel: "Pay? $Rate! *_v2", fieldFormat: "Text" }],
  });
  assert.equal(input.fields[0].vanityLabel, "Pay? $Rate! *_v2");
  assert.equal(input.fields[0].fieldName, "Pay Rate _v2");
});

test("display names still reject control characters", () => {
  assert.throws(
    () =>
      validateCustomSourceInput({
        sourceName: "Bonus File",
        fields: [{ vanityLabel: "Pay\u0007Rate", fieldFormat: "Text" }],
      }),
    /Field 1 display name contains characters that cannot be stored/,
  );
});

test("source names and source field names keep the strict rules", () => {
  assert.throws(
    () =>
      validateCustomSourceInput({
        sourceName: "Bonus?",
        fields: [{ vanityLabel: "Amount", fieldFormat: "Text" }],
      }),
    /Source name can use letters, numbers/,
  );
  assert.throws(
    () =>
      validateCustomSourceInput({
        sourceName: "Bonus File",
        fields: [
          { vanityLabel: "Amount", fieldName: "Amount$", fieldFormat: "Text" },
        ],
      }),
    /Field 1 source field name can use letters, numbers/,
  );
});

test("a blank source field name is derived safely from the display name", () => {
  assert.equal(
    fieldNameFromDisplayName("  ¿Total* (USD)?  ", 1),
    "Total (USD)",
  );
  assert.equal(fieldNameFromDisplayName("?!*$", 4), "field_4");
  const input = validateCustomSourceInput({
    sourceName: "Bonus File",
    fields: [
      { vanityLabel: "Amount", fieldFormat: "Text" },
      { vanityLabel: "$$$", fieldFormat: "Currency" },
    ],
  });
  assert.equal(input.fields[1].fieldName, "field_2");
  assert.equal(input.fields[1].vanityLabel, "$$$");
});

const storedRows = {
  "custom.bonus-file": {
    id: "source-1",
    source_key: "custom.bonus-file",
    source_name: "Bonus File",
    source_system: "",
    created_by_user_id: "user-1",
    created_by_username: "ada",
    created_by_full_name: "Ada Lovelace",
  },
  "custom.other-file": {
    id: "source-2",
    source_key: "custom.other-file",
    source_name: "Other File",
    source_system: "",
    created_by_user_id: "user-2",
    created_by_username: "grace",
    created_by_full_name: "Grace Hopper",
  },
};

function fakeManageRepository() {
  const calls = [];
  const outcome = (sourceKey, canManage) => {
    const row = storedRows[sourceKey];
    if (!row) return { status: "not_found" };
    return canManage(row) ? { status: "ok", row } : { status: "forbidden" };
  };
  return {
    calls,
    updateCustomSource: async (_pool, { sourceKey, input, canManage }) => {
      const result = outcome(sourceKey, canManage);
      calls.push({ kind: "update", sourceKey, status: result.status, input });
      return result.status === "ok"
        ? { status: "ok", source: { sourceKey, sourceFile: input.sourceName } }
        : result;
    },
    deleteCustomSource: async (_pool, { sourceKey, canManage }) => {
      const result = outcome(sourceKey, canManage);
      calls.push({ kind: "delete", sourceKey, status: result.status });
      return result;
    },
  };
}

const editBody = JSON.stringify({
  sourceName: "Bonus File v2",
  fields: [{ displayName: "Amount", fieldFormat: "Currency" }],
});

async function manage(port, method, key, body) {
  return fetch(
    `http://127.0.0.1:${port}/api/source-library/custom/${encodeURIComponent(key)}`,
    {
      method,
      headers: { "content-type": "application/json" },
      ...(body ? { body } : {}),
    },
  );
}

test("custom source keys in routes must look like custom keys", () => {
  assert.equal(customSourceKeyParam("custom.bonus-file"), "custom.bonus-file");
  assert.equal(customSourceKeyParam("wd.sample"), "");
  assert.equal(customSourceKeyParam("custom.../etc"), "");
  assert.equal(customSourceKeyParam(""), "");
});

test("only the creator or an administrator can manage a custom source", () => {
  const row = storedRows["custom.bonus-file"];
  assert.equal(canManageCustomSource({ id: "user-1" }, row, false), true);
  assert.equal(canManageCustomSource({ id: "user-2" }, row, false), false);
  assert.equal(canManageCustomSource({ id: "user-2" }, row, true), true);
  assert.equal(
    canManageCustomSource({}, { created_by_user_id: "" }, false),
    false,
  );
});

test("the creator can edit and delete their custom source", async () => {
  const repo = fakeManageRepository();
  await withSourceLibraryApp(repo, async ({ port }) => {
    const edited = await manage(port, "PUT", "custom.bonus-file", editBody);
    assert.equal(edited.status, 200);
    assert.equal((await edited.json()).sourceFile, "Bonus File v2");
    assert.equal(repo.calls[0].input.fields[0].fieldName, "Amount");

    const removed = await manage(port, "DELETE", "custom.bonus-file");
    assert.equal(removed.status, 204);
  });
});

test("someone else cannot edit or delete a custom source", async () => {
  const repo = fakeManageRepository();
  await withSourceLibraryApp(repo, async ({ port }) => {
    const edited = await manage(port, "PUT", "custom.other-file", editBody);
    assert.equal(edited.status, 403);
    const removed = await manage(port, "DELETE", "custom.other-file");
    assert.equal(removed.status, 403);
    assert.deepEqual(
      repo.calls.map((call) => call.status),
      ["forbidden", "forbidden"],
    );
  });
});

test("a Source Library administrator can manage any custom source", async () => {
  const repo = fakeManageRepository();
  await withSourceLibraryApp(
    {
      ...repo,
      sourceLibraryAccessDecision: () => ({ allowed: true, reason: "ok" }),
    },
    async ({ port }) => {
      const edited = await manage(port, "PUT", "custom.other-file", editBody);
      assert.equal(edited.status, 200);
      const removed = await manage(port, "DELETE", "custom.other-file");
      assert.equal(removed.status, 204);
    },
  );
});

test("missing, malformed, and invalid edits are rejected", async () => {
  const repo = fakeManageRepository();
  await withSourceLibraryApp(repo, async ({ port }) => {
    assert.equal(
      (await manage(port, "PUT", "custom.gone", editBody)).status,
      404,
    );
    assert.equal((await manage(port, "DELETE", "custom.gone")).status, 404);
    assert.equal((await manage(port, "DELETE", "wd.sample")).status, 404);
    const invalid = await manage(
      port,
      "PUT",
      "custom.bonus-file",
      JSON.stringify({ sourceName: "", fields: [] }),
    );
    assert.equal(invalid.status, 400);
    assert.equal(
      repo.calls.filter(
        (call) => call.kind === "update" && call.status === "ok",
      ).length,
      0,
    );
  });
});

function fakeTransactionalPool(lockedRow) {
  const queries = [];
  const client = {
    async query(text, params) {
      queries.push({ text: String(text), params });
      if (/FOR UPDATE/i.test(text))
        return { rows: lockedRow ? [lockedRow] : [] };
      if (/INSERT INTO/i.test(text))
        return {
          rows: [
            {
              id: `field-${queries.length}`,
              field_order: params?.[1],
              field_name: params?.[2],
              vanity_label: params?.[3],
            },
          ],
        };
      return { rows: [] };
    },
    release() {},
  };
  return { queries, pool: { connect: async () => client } };
}

test("update keeps the source key and replaces every field", async () => {
  const { queries, pool } = fakeTransactionalPool(
    storedRows["custom.bonus-file"],
  );
  const result = await updateCustomSource(pool, {
    sourceKey: "custom.bonus-file",
    input: validateCustomSourceInput({
      sourceName: "Bonus File v2",
      fields: [{ displayName: "Amount", fieldFormat: "Currency" }],
    }),
    canManage: () => true,
  });
  assert.equal(result.status, "ok");
  assert.equal(result.source.sourceKey, "custom.bonus-file");
  assert.equal(result.source.sourceFile, "Bonus File v2");
  const statements = queries.map((query) => query.text);
  assert.ok(statements.some((text) => /^\s*UPDATE/im.test(text)));
  assert.ok(statements.some((text) => /DELETE FROM/i.test(text)));
  assert.ok(statements.some((text) => /COMMIT/i.test(text)));
});

test("update and delete stop before writing when the user cannot manage", async () => {
  const { queries, pool } = fakeTransactionalPool(
    storedRows["custom.other-file"],
  );
  const deleted = await deleteCustomSource(pool, {
    sourceKey: "custom.other-file",
    canManage: () => false,
  });
  assert.equal(deleted.status, "forbidden");
  assert.ok(!queries.some((query) => /DELETE FROM/i.test(query.text)));

  const missing = fakeTransactionalPool(null);
  const updated = await updateCustomSource(missing.pool, {
    sourceKey: "custom.gone",
    input: validateCustomSourceInput({
      sourceName: "Gone",
      fields: [{ displayName: "Amount", fieldFormat: "Currency" }],
    }),
    canManage: () => true,
  });
  assert.equal(updated.status, "not_found");
  assert.ok(!missing.queries.some((query) => /^\s*UPDATE/im.test(query.text)));
});
