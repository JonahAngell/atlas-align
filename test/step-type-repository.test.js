/**
 * Step type definitions in Postgres: the startup import, conflict rejection
 * and GET /api/step-types (Phase 6 of the Dynamic Step Type Builder plan).
 *
 * The fake pool keeps atlas_step_type_definitions in memory and answers each
 * statement by its SQL file, so these tests exercise the real repository
 * code and SQL resources without a database.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { documentHash } from "../src/canonical-json.js";
import {
  checkStepTypeDefinitions,
  readRepositoryStepTypes,
} from "../src/step-type-engine.js";
import {
  importRepositoryStepTypes,
  importStepTypeDefinitions,
  listStepTypes,
} from "../src/step-type-repository.js";

const ROOT = new URL("../", import.meta.url);
const read = (file) => readFileSync(new URL(file, ROOT), "utf8");
const SQL = {
  insert: read("sql/step-type-repository/insert-definition.sql"),
  get: read("sql/step-type-repository/get-definition-version.sql"),
  event: read("sql/step-type-repository/record-event.sql"),
  list: read("sql/step-type-repository/list-step-types.sql"),
};
const MANIFEST = JSON.parse(read("catalogs/step-types/manifest.json"));
const sortRecords = () =>
  JSON.parse(read("catalogs/step-types/sort_records.json"));

/** An in-memory atlas_step_type_definitions behind the repository SQL. */
function fakePool(rows = []) {
  const table = new Map(
    rows.map((row) => [`${row.type_id}@${row.version}`, row]),
  );
  const events = [];
  const statements = [];
  const query = async (text, params = []) => {
    statements.push(text);
    if (["BEGIN", "COMMIT", "ROLLBACK"].includes(text)) return { rows: [] };
    if (text === SQL.insert) {
      const key = `${params[0]}@${params[1]}`;
      if (table.has(key)) return { rows: [] };
      const row = {
        id: `def-${table.size + 1}`,
        type_id: params[0],
        version: params[1],
        schema_version: params[2],
        definition: JSON.parse(params[3]),
        content_hash: params[4],
        status: params[5],
        origin: params[6],
        created_by_username: params[8],
      };
      table.set(key, row);
      return { rows: [row] };
    }
    if (text === SQL.get)
      return { rows: [table.get(`${params[0]}@${params[1]}`)].filter(Boolean) };
    if (text === SQL.event) {
      events.push({ definitionId: params[0], event: params[3] });
      return { rows: [] };
    }
    if (text === SQL.list)
      return {
        rows: [...table.values()].map((row) => ({
          ...row,
          latest: row.latest ?? true,
        })),
      };
    throw new Error(`Unexpected SQL: ${text.slice(0, 80)}`);
  };
  return {
    table,
    events,
    statements,
    query,
    connect: async () => ({ query, release() {} }),
  };
}

const quietLogger = () => {
  const lines = [];
  return {
    lines,
    log: (line) => lines.push(JSON.parse(line)),
    error: (line) => lines.push(JSON.parse(line)),
  };
};

test("the startup import inserts every repository definition as published", async () => {
  const pool = fakePool();
  const logger = quietLogger();
  const result = await importRepositoryStepTypes(pool, { logger });
  assert.deepEqual(result.rejected, []);
  assert.deepEqual(result.conflicts, []);
  assert.equal(result.imported.length, MANIFEST.definitions.length);
  for (const entry of MANIFEST.definitions) {
    const row = pool.table.get(`${entry.id}@${entry.version}`);
    assert.equal(row.status, "published");
    assert.equal(row.origin, "repository");
    assert.equal(row.content_hash, entry.hash);
  }
  assert.equal(pool.events.length, MANIFEST.definitions.length);
  assert.ok(
    pool.events.every((event) => event.event === "imported_from_repository"),
  );
  assert.equal(logger.lines.at(-1).event, "step_types_imported");
});

test("importing the same files again changes nothing", async () => {
  const pool = fakePool();
  const logger = quietLogger();
  await importRepositoryStepTypes(pool, { logger });
  const again = await importRepositoryStepTypes(pool, { logger });
  assert.equal(again.imported.length, 0);
  assert.equal(again.unchanged.length, MANIFEST.definitions.length);
  assert.equal(pool.events.length, MANIFEST.definitions.length);
});

test("a changed file with a stored version is rejected, logged and never overwrites", async () => {
  const stored = sortRecords();
  const pool = fakePool([
    {
      id: "def-stored",
      type_id: stored.id,
      version: stored.version,
      definition: stored,
      content_hash: documentHash(stored),
      status: "published",
      origin: "builder",
    },
  ]);
  const changed = { ...sortRecords(), label: "Sort Records (edited)" };
  const logger = quietLogger();
  const result = await importStepTypeDefinitions(pool, {
    definitions: [changed],
    logger,
  });
  assert.equal(result.imported.length, 0);
  assert.deepEqual(result.conflicts, [
    {
      id: "sort_records",
      version: 1,
      fileHash: documentHash(changed),
      storedHash: documentHash(stored),
    },
  ]);
  assert.equal(
    pool.table.get("sort_records@1").definition.label,
    "Sort Records",
  );
  assert.equal(pool.events.length, 0);
  const logged = logger.lines.find(
    (line) => line.event === "step_type_version_conflict",
  );
  assert.equal(logged.level, "error");
  assert.match(logged.message, /Publish the change as a new version/);
});

test("repository files are checked by the engine before import", () => {
  const { schema, definitions, rejected } = readRepositoryStepTypes();
  assert.deepEqual(rejected, []);
  const newer = {
    ...sortRecords(),
    id: "newer_type",
    version: 1,
    schemaVersion: 99,
    aliases: { step_type: [], type: [] },
  };
  const broken = {
    ...sortRecords(),
    id: "broken_type",
    version: 1,
    label: "",
    aliases: { step_type: [], type: [] },
  };
  const checked = checkStepTypeDefinitions(schema, [
    ...definitions.map((entry) => entry.definition),
    newer,
    broken,
  ]);
  assert.equal(checked.accepted.length, definitions.length);
  assert.deepEqual(
    checked.rejected.map((entry) => entry.id),
    ["newer_type", "broken_type"],
  );
  assert.equal(
    checked.rejected[0].errors[0].code,
    "unsupported_schema_version",
  );
});

test("a file edited without rebuilding the manifest is not imported", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "atlas-step-types-"));
  const catalog = pathToFileURL(`${dir}/`);
  writeFileSync(
    new URL("schema.json", catalog),
    read("catalogs/step-types/schema.json"),
  );
  const entry = MANIFEST.definitions.find((item) => item.id === "sort_records");
  writeFileSync(
    new URL("manifest.json", catalog),
    JSON.stringify({ schemaVersion: 1, definitions: [entry] }),
  );
  writeFileSync(
    new URL(entry.file, catalog),
    JSON.stringify({ ...sortRecords(), label: "Edited by hand" }),
  );
  const pool = fakePool();
  const logger = quietLogger();
  const result = await importRepositoryStepTypes(pool, { catalog, logger });
  assert.equal(result.imported.length, 0);
  assert.equal(result.rejected[0].errors[0].code, "manifest_mismatch");
  assert.equal(pool.table.size, 0);
  assert.ok(
    logger.lines.some((line) => line.event === "step_type_definition_rejected"),
  );
});

test("GET /api/step-types lists the latest versions and pinned older ones", async () => {
  const v1 = sortRecords();
  const v2 = { ...sortRecords(), version: 2, label: "Sort Records v2" };
  const pool = fakePool([
    {
      type_id: "sort_records",
      version: 1,
      status: "retired",
      content_hash: documentHash(v1),
      definition: v1,
      latest: false,
    },
    {
      type_id: "sort_records",
      version: 2,
      status: "published",
      content_hash: documentHash(v2),
      definition: v2,
      latest: true,
    },
  ]);
  const payload = await listStepTypes(pool);
  assert.deepEqual(payload.latest, { sort_records: 2 });
  assert.deepEqual(payload.schemaVersions, [1]);
  assert.equal(typeof payload.engineVersion, "string");
  assert.deepEqual(
    payload.definitions.map((row) => [row.definition.version, row.status]),
    [
      [1, "retired"],
      [2, "published"],
    ],
  );
});

test("the SQL never overwrites a version and pins publications to the latest", () => {
  assert.match(SQL.insert, /ON CONFLICT \(type_id, version\) DO NOTHING/);
  for (const file of [
    "sql/audit-workflow-repository/create-publication.sql",
    "sql/audit-workflow-repository/create-lock-publication.sql",
    "sql/audit-review-repository/create-audit-publication.sql",
  ]) {
    const text = read(file);
    assert.match(text, /step_type_versions/, file);
    assert.match(text, /status = 'published'/, file);
  }
  const migration = read(
    ".launch/migrations/20261117120000_create_atlas_step_type_definitions.sql",
  );
  assert.match(migration, /-- migrate:down/);
  assert.match(migration, /BEFORE UPDATE ON atlas_step_type_definitions/);
});
