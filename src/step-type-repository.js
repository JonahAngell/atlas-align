/**
 * Step type definitions in Postgres (atlas_step_type_definitions).
 *
 * Every (type_id, version) is one immutable row. At startup ATLAS Align
 * imports the repository files in catalogs/step-types/: a version the
 * database lacks is inserted as published, an identical one is skipped, and
 * one whose content differs from the stored row is rejected and logged. A
 * stored row is never overwritten; a changed definition needs a new version.
 */
import { documentHash } from "./canonical-json.js";
import { withTransaction } from "./db-transaction.js";
import { loadSql } from "./sql.js";
import {
  checkStepTypeDefinitions,
  loadStepTypeEngine,
  readRepositoryStepTypes,
} from "./step-type-engine.js";

const sqlResource = (name) =>
  loadSql(`../sql/step-type-repository/${name}.sql`, import.meta.url);

const SQL = Object.freeze({
  insertDefinition: sqlResource("insert-definition"),
  getDefinitionVersion: sqlResource("get-definition-version"),
  recordEvent: sqlResource("record-event"),
  listStepTypes: sqlResource("list-step-types"),
  listRetiredStepTypes: sqlResource("list-retired-step-types"),
  retireDefinition: sqlResource("retire-definition"),
});

/** The author recorded on rows the server imports from the repository. */
export const REPOSITORY_ACTOR = Object.freeze({
  userId: "atlas-align",
  username: "atlas-align",
  fullName: "ATLAS Align repository",
});

function log(logger, level, event, fields) {
  logger?.[level === "error" ? "error" : "log"]?.(
    JSON.stringify({ level, event, ...fields }),
  );
}

/**
 * Imports repository definitions. `definitions` must already have passed the
 * engine's checks. Returns {imported, unchanged, conflicts}; each conflict
 * names the type, version and both hashes.
 */
export async function importStepTypeDefinitions(
  pool,
  { definitions, actor = REPOSITORY_ACTOR, logger = console } = {},
) {
  const result = { imported: [], unchanged: [], conflicts: [] };
  for (const definition of definitions || []) {
    const hash = documentHash(definition);
    const key = { id: definition.id, version: definition.version };
    const outcome = await withTransaction(pool, async (client) => {
      const inserted = (
        await client.query(SQL.insertDefinition, [
          definition.id,
          definition.version,
          definition.schemaVersion,
          JSON.stringify(definition),
          hash,
          "published",
          "repository",
          actor.userId,
          actor.username,
          actor.fullName,
        ])
      ).rows[0];
      if (inserted) {
        await client.query(SQL.recordEvent, [
          inserted.id,
          definition.id,
          definition.version,
          "imported_from_repository",
          JSON.stringify({ contentHash: hash }),
          actor.userId,
          actor.username,
          actor.fullName,
        ]);
        return { kind: "imported" };
      }
      const existing = (
        await client.query(SQL.getDefinitionVersion, [
          definition.id,
          definition.version,
        ])
      ).rows[0];
      if (existing?.content_hash === hash) return { kind: "unchanged" };
      return { kind: "conflict", storedHash: existing?.content_hash || null };
    });
    if (outcome.kind === "imported") result.imported.push(key);
    else if (outcome.kind === "unchanged") result.unchanged.push(key);
    else {
      const conflict = {
        ...key,
        fileHash: hash,
        storedHash: outcome.storedHash,
      };
      result.conflicts.push(conflict);
      log(logger, "error", "step_type_version_conflict", {
        message: `${definition.id} version ${definition.version} in catalogs/step-types/ differs from the stored version; the stored version is kept. Publish the change as a new version.`,
        ...conflict,
      });
    }
  }
  return result;
}

/**
 * Startup import: reads catalogs/step-types/, checks each file with the
 * engine, and imports what passed. Files that fail are logged and skipped;
 * the rest still import.
 */
export async function importRepositoryStepTypes(
  pool,
  { catalog, logger = console } = {},
) {
  const repository = readRepositoryStepTypes(catalog);
  const checked = checkStepTypeDefinitions(
    repository.schema,
    repository.definitions.map((entry) => entry.definition),
  );
  const rejected = [...repository.rejected, ...checked.rejected];
  rejected.forEach((entry) =>
    log(logger, "error", "step_type_definition_rejected", {
      message: `${entry.id || entry.file} version ${entry.version} was not imported.`,
      id: entry.id,
      version: entry.version,
      errors: entry.errors,
    }),
  );
  const result = await importStepTypeDefinitions(pool, {
    definitions: checked.accepted,
    logger,
  });
  log(logger, "info", "step_types_imported", {
    imported: result.imported.length,
    unchanged: result.unchanged.length,
    conflicts: result.conflicts.length,
    rejected: rejected.length,
  });
  return { ...result, rejected };
}

/**
 * What GET /api/step-types returns: the latest published version of every
 * type and the versions publications are pinned to. `latest` maps each type
 * to the version editable audits use. Definitions whose schema version this
 * server's engine cannot read are left for the client to report.
 */
export async function listStepTypes(pool) {
  const { engineVersion, schemaVersions } = loadStepTypeEngine();
  const rows = (await pool.query(SQL.listStepTypes)).rows;
  const retired = (await pool.query(SQL.listRetiredStepTypes)).rows.map(
    (row) => row.type_id,
  );
  const latest = {};
  rows.forEach((row) => {
    if (row.latest) latest[row.type_id] = Number(row.version);
  });
  return {
    engineVersion,
    schemaVersions,
    latest,
    retired,
    definitions: rows.map((row) => ({
      status: row.status,
      contentHash: row.content_hash,
      definition: row.definition,
    })),
  };
}

/**
 * Retires one published version (the Step Type Builder's Retire action) and
 * records a 'retired' event in the same transaction. Publications pinned to
 * it keep rendering with it; when no published version of the type is left
 * the type leaves the picker. Returns the retired row, or null when that
 * version is not published (missing, a draft, or already retired).
 */
export async function retireStepTypeVersion(
  pool,
  { typeId, version, actor, reason = "" } = {},
) {
  if (!actor?.userId || !actor?.username || !actor?.fullName)
    throw new Error("retireStepTypeVersion() needs the acting user");
  return withTransaction(pool, async (client) => {
    const retired = (
      await client.query(SQL.retireDefinition, [
        typeId,
        version,
        actor.userId,
        actor.username,
        actor.fullName,
      ])
    ).rows[0];
    if (!retired) return null;
    await client.query(SQL.recordEvent, [
      retired.id,
      retired.type_id,
      retired.version,
      "retired",
      JSON.stringify(reason ? { reason: String(reason) } : {}),
      actor.userId,
      actor.username,
      actor.fullName,
    ]);
    return retired;
  });
}
