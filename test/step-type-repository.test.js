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
  removedStepTypeOptionValues,
  retireStepTypeVersion,
  StepTypeRetireBlockedError,
} from "../src/step-type-repository.js";

const ROOT = new URL("../", import.meta.url);
const read = (file) => readFileSync(new URL(file, ROOT), "utf8");
const SQL = {
  insert: read("sql/step-type-repository/insert-definition.sql"),
  get: read("sql/step-type-repository/get-definition-version.sql"),
  event: read("sql/step-type-repository/record-event.sql"),
  list: read("sql/step-type-repository/list-step-types.sql"),
  retired: read("sql/step-type-repository/list-retired-step-types.sql"),
  retire: read("sql/step-type-repository/retire-definition.sql"),
  lock: read("sql/step-type-repository/lock-published-versions.sql"),
};
const DRAFTS_MIGRATION = read(
  ".launch/migrations/20261117130000_create_atlas_step_type_drafts.sql",
);
const MANIFEST = JSON.parse(read("catalogs/step-types/manifest.json"));
const sortRecords = () =>
  JSON.parse(read("catalogs/step-types/sort_records.json"));
const removeDuplicates = () =>
  JSON.parse(read("catalogs/step-types/remove_duplicates.json"));

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
      events.push({
        definitionId: params[0],
        typeId: params[1],
        version: params[2],
        event: params[3],
        details: JSON.parse(params[4]),
        actor: params[5],
      });
      return { rows: [] };
    }
    if (text === SQL.retire) {
      const row = table.get(`${params[0]}@${params[1]}`);
      if (row?.status !== "published") return { rows: [] };
      row.status = "retired";
      row.updated_by_username = params[3];
      return { rows: [row] };
    }
    if (text === SQL.lock)
      return {
        rows: [...table.values()]
          .filter(
            (row) => row.type_id === params[0] && row.status === "published",
          )
          .sort((a, b) => b.version - a.version),
      };
    if (text === SQL.retired) {
      const statuses = new Map();
      for (const row of table.values())
        statuses.set(row.type_id, [
          ...(statuses.get(row.type_id) || []),
          row.status,
        ]);
      return {
        rows: [...statuses]
          .filter(
            ([, list]) =>
              list.includes("retired") && !list.includes("published"),
          )
          .map(([type_id]) => ({ type_id })),
      };
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

const BUILDER = Object.freeze({
  userId: "u-42",
  username: "admin.user",
  fullName: "Admin User",
});

test("the builder publishes through the same insert and event SQL", async () => {
  const pool = fakePool();
  const definition = { ...sortRecords(), version: 2, label: "Sort v2" };
  const client = await pool.connect();
  const inserted = (
    await client.query(SQL.insert, [
      definition.id,
      definition.version,
      definition.schemaVersion,
      JSON.stringify(definition),
      documentHash(definition),
      "published",
      "builder",
      BUILDER.userId,
      BUILDER.username,
      BUILDER.fullName,
    ])
  ).rows[0];
  assert.equal(inserted.status, "published");
  assert.equal(pool.table.get("sort_records@2").origin, "builder");
  // The insert takes the origin as a parameter; the migration allows it.
  assert.match(SQL.insert, /\$7/);
  assert.match(
    read(
      ".launch/migrations/20261117120000_create_atlas_step_type_definitions.sql",
    ),
    /origin IN \('repository', 'builder'\)/,
  );
  // The same (type_id, version) can never be published twice.
  const again = await client.query(SQL.insert, [
    definition.id,
    definition.version,
    definition.schemaVersion,
    JSON.stringify(definition),
    documentHash(definition),
    "published",
    "builder",
    BUILDER.userId,
    BUILDER.username,
    BUILDER.fullName,
  ]);
  assert.equal(again.rows.length, 0);
});

test("retiring a published version records a retired event", async () => {
  const pool = fakePool();
  await importRepositoryStepTypes(pool, { logger: quietLogger() });
  const retired = await retireStepTypeVersion(pool, {
    typeId: "sort_records",
    version: 1,
    actor: BUILDER,
    reason: "Replaced by Order Records",
  });
  assert.equal(retired.status, "retired");
  assert.equal(pool.table.get("sort_records@1").status, "retired");
  assert.equal(
    pool.table.get("sort_records@1").updated_by_username,
    "admin.user",
  );
  const event = pool.events.at(-1);
  assert.deepEqual(
    { ...event, definitionId: undefined },
    {
      definitionId: undefined,
      typeId: "sort_records",
      version: 1,
      event: "retired",
      details: { reason: "Replaced by Order Records" },
      actor: "u-42",
    },
  );
  assert.deepEqual(pool.statements.slice(-5), [
    "BEGIN",
    SQL.lock,
    SQL.retire,
    SQL.event,
    "COMMIT",
  ]);

  // Retiring again, or a version that does not exist, changes nothing.
  const events = pool.events.length;
  for (const version of [1, 99])
    assert.equal(
      await retireStepTypeVersion(pool, {
        typeId: "sort_records",
        version,
        actor: BUILDER,
      }),
      null,
    );
  assert.equal(pool.events.length, events);
  await assert.rejects(
    retireStepTypeVersion(pool, { typeId: "sort_records", version: 1 }),
    /acting user/,
  );
});

test("GET /api/step-types names types with no published version left", async () => {
  const pool = fakePool();
  await importRepositoryStepTypes(pool, { logger: quietLogger() });
  assert.deepEqual((await listStepTypes(pool)).retired, []);
  await retireStepTypeVersion(pool, {
    typeId: "sort_records",
    version: 1,
    actor: BUILDER,
  });
  assert.deepEqual((await listStepTypes(pool)).retired, ["sort_records"]);
});

/** remove_duplicates v2 whose "Records to keep" choice gains one option. */
function removeDuplicatesWithExtraOption(extra = "Keep newest record") {
  const definition = { ...removeDuplicates(), version: 2 };
  definition.fields = definition.fields.map((field) =>
    field.param === "duplicate_action"
      ? {
          ...field,
          options: [...field.options, { value: extra, label: extra }],
        }
      : field,
  );
  return definition;
}

function addPublished(pool, definition) {
  pool.table.set(`${definition.id}@${definition.version}`, {
    id: `def-${pool.table.size + 1}`,
    type_id: definition.id,
    version: definition.version,
    definition,
    status: "published",
  });
}

test("retiring the latest version is refused when the older one lacks its options", async () => {
  const pool = fakePool();
  await importRepositoryStepTypes(pool, { logger: quietLogger() });
  addPublished(pool, removeDuplicatesWithExtraOption());
  const events = pool.events.length;
  await assert.rejects(
    retireStepTypeVersion(pool, {
      typeId: "remove_duplicates",
      version: 2,
      actor: BUILDER,
    }),
    (error) => {
      assert.ok(error instanceof StepTypeRetireBlockedError);
      assert.equal(error.code, "option_removed");
      assert.equal(error.fallbackVersion, 1);
      assert.deepEqual(error.removed, [
        {
          param: "duplicate_action",
          label: error.removed[0].label,
          value: "Keep newest record",
        },
      ]);
      assert.match(error.message, /"Keep newest record"/);
      return true;
    },
  );
  assert.equal(pool.table.get("remove_duplicates@2").status, "published");
  assert.equal(pool.events.length, events, "no event for a refused retire");
  assert.equal(pool.statements.at(-1), "ROLLBACK");
});

test("retiring is allowed when no option values would be stranded", async () => {
  const pool = fakePool();
  await importRepositoryStepTypes(pool, { logger: quietLogger() });
  // An older version can always go: the latest version stays in use.
  addPublished(pool, removeDuplicatesWithExtraOption());
  assert.equal(
    (
      await retireStepTypeVersion(pool, {
        typeId: "remove_duplicates",
        version: 1,
        actor: BUILDER,
      })
    ).status,
    "retired",
  );
  // The only published version can go: its steps render with it (see the
  // list SQL), and no other version takes over.
  assert.equal(
    (
      await retireStepTypeVersion(pool, {
        typeId: "remove_duplicates",
        version: 2,
        actor: BUILDER,
      })
    ).status,
    "retired",
  );
  // The latest can go when the version before it has every option value.
  const same = { ...sortRecords(), version: 2, label: "Order Records" };
  addPublished(pool, same);
  assert.equal(
    (
      await retireStepTypeVersion(pool, {
        typeId: "sort_records",
        version: 2,
        actor: BUILDER,
      })
    ).status,
    "retired",
  );
});

test("removed option values cover subtypes, choices and dropped controls", () => {
  const before = {
    subtypes: {
      param: "mode",
      label: "Mode",
      options: [
        { value: "a", fields: [{ param: "x", options: [{ value: "1" }] }] },
        { value: "b" },
      ],
    },
    fields: [{ param: "kind", label: "Kind", options: [{ value: "k" }] }],
  };
  const after = {
    subtypes: { param: "mode", options: [{ value: "a" }] },
    fields: [{ param: "kind", options: [{ value: "k" }, { value: "new" }] }],
  };
  assert.deepEqual(
    removedStepTypeOptionValues(before, after).map((item) => item.value),
    ["b", "1"],
  );
  assert.deepEqual(removedStepTypeOptionValues(after, after), []);
});

test("the retire SQL changes only status and updated_* of a published row", () => {
  assert.match(SQL.retire, /^UPDATE atlas_step_type_definitions$/m);
  assert.match(SQL.retire, /status = 'retired'/);
  assert.match(SQL.retire, /AND status = 'published'/);
  const assignments = [...SQL.retire.matchAll(/^\s+(\w+) = /gm)].map(
    (match) => match[1],
  );
  assert.deepEqual(assignments.slice(0, 5), [
    "status",
    "updated_by_user_id",
    "updated_by_username",
    "updated_by_full_name",
    "updated_at",
  ]);
  assert.match(SQL.retired, /NOT bool_or\(status = 'published'\)/);
  // Pinned retired versions keep rendering; only drafts are never served.
  assert.match(SQL.list, /definition\.status <> 'draft'/);
  // A type with no published version left still sends its highest retired
  // version, so its steps render even without a bundled file.
  assert.match(SQL.list, /last_retired AS \(/);
  assert.match(SQL.list, /FROM\s+last_retired/);
  assert.match(SQL.lock, /status = 'published'/);
  assert.match(SQL.lock, /FOR UPDATE\s*$/);
});

test("the drafts migration matches the builder contract", () => {
  const [up, down] = DRAFTS_MIGRATION.split("-- migrate:down");
  assert.ok(up.startsWith("-- migrate:up"));
  assert.ok(down, "has a migrate:down section");
  const table =
    /CREATE TABLE IF NOT EXISTS atlas_step_type_drafts \(([\s\S]*?)\n\);/.exec(
      up,
    )[1];
  for (const column of [
    /id uuid PRIMARY KEY DEFAULT gen_random_uuid\(\)/,
    /type_id text NOT NULL,/,
    /base_version integer NULL,/,
    /definition jsonb NOT NULL,/,
    /revision integer NOT NULL DEFAULT 1,/,
    /created_at timestamptz NOT NULL DEFAULT current_timestamp/,
    /updated_at timestamptz NOT NULL DEFAULT current_timestamp/,
    /UNIQUE \(type_id\)/,
    /CHECK \(type_id ~ '\^\[a-z\]\[a-z0-9_\]\*\$'\)/,
    /CHECK \(jsonb_typeof\(definition\) = 'object'\)/,
    /CHECK \(definition ->> 'id' = type_id\)/,
    /CHECK \(revision > 0\)/,
  ])
    assert.match(table, column);
  for (const who of ["created_by", "updated_by"])
    for (const part of ["user_id", "username", "full_name"]) {
      assert.match(table, new RegExp(`${who}_${part} text NOT NULL`));
      assert.match(
        table,
        new RegExp(`CHECK \\(btrim\\(${who}_${part}\\) <> ''\\)`),
      );
    }
  // Draft events: every old event value stays, plus the two draft events.
  for (const event of [
    "created",
    "published",
    "retired",
    "imported_from_repository",
    "draft_saved",
    "draft_discarded",
  ])
    assert.match(up, new RegExp(`'${event}'`));
  assert.match(up, /ALTER COLUMN definition_id DROP NOT NULL/);
  assert.match(up, /ck_atlas_step_type_events_definition_link/);
  // The definitions immutability trigger is not touched.
  assert.doesNotMatch(
    DRAFTS_MIGRATION,
    /atlas_step_type_definitions_immutable/,
  );
  assert.match(down, /DROP TABLE IF EXISTS atlas_step_type_drafts/);
  assert.match(down, /ALTER COLUMN definition_id SET NOT NULL/);
  assert.match(
    down,
    /DELETE FROM atlas_step_type_events\s+WHERE event IN \('draft_saved', 'draft_discarded'\)/,
  );
});
