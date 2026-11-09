import { randomUUID } from "node:crypto";
import { withTransaction } from "./db-transaction.js";
import { loadSql } from "./sql.js";
import { customSourceFromRecord } from "./custom-source.js";

const sqlResource = (name) =>
  loadSql(`../sql/custom-source/${name}.sql`, import.meta.url);

const SQL = Object.freeze({
  listKeys: sqlResource("list-custom-source-keys"),
  list: sqlResource("list-custom-sources"),
  insertSource: sqlResource("insert-custom-source"),
  insertField: sqlResource("insert-custom-source-field"),
  lock: sqlResource("lock-custom-source"),
  update: sqlResource("update-custom-source"),
  deleteFields: sqlResource("delete-custom-source-fields"),
  delete: sqlResource("delete-custom-source"),
});

export async function listCustomSourceKeys(pool) {
  const result = await pool.query(SQL.listKeys);
  return result.rows.map((row) => row.source_key);
}

export async function listCustomSources(pool) {
  const result = await pool.query(SQL.list);
  return result.rows.map((row) => customSourceFromRecord(row));
}

async function insertFields(client, sourceId, inputFields) {
  const fields = [];
  for (const [index, field] of inputFields.entries()) {
    const fieldId = randomUUID();
    await client.query(SQL.insertField, [
      fieldId,
      sourceId,
      index + 1,
      field.fieldName,
      field.vanityLabel,
      field.fieldFormat,
      field.businessDescription,
    ]);
    fields.push({
      id: fieldId,
      field_order: index + 1,
      field_name: field.fieldName,
      vanity_label: field.vanityLabel,
      field_format: field.fieldFormat,
      business_description: field.businessDescription,
    });
  }
  return fields;
}

export async function insertCustomSource(
  pool,
  { sourceKey, input, createdBy },
) {
  return withTransaction(pool, async (client) => {
    const sourceId = randomUUID();
    await client.query(SQL.insertSource, [
      sourceId,
      sourceKey,
      input.sourceName,
      input.sourceSystem,
      createdBy.id,
      createdBy.username,
      createdBy.fullName,
    ]);
    const fields = await insertFields(client, sourceId, input.fields);
    return customSourceFromRecord({
      id: sourceId,
      source_key: sourceKey,
      source_name: input.sourceName,
      source_system: input.sourceSystem,
      created_by_user_id: createdBy.id,
      created_by_username: createdBy.username,
      created_by_full_name: createdBy.fullName,
      avatar_url: null,
      fields,
    });
  });
}

/**
 * Locks one custom source and checks the caller may change it. Returns the
 * locked row, or a { status } outcome the route turns into 404 or 403.
 */
async function lockManageableSource(client, sourceKey, canManage) {
  const result = await client.query(SQL.lock, [sourceKey]);
  const row = result.rows[0];
  if (!row) return { status: "not_found" };
  if (!canManage(row)) return { status: "forbidden", row };
  return { status: "ok", row };
}

/**
 * Replaces a custom source's name, system, and fields. The source key never
 * changes, so audits that already use the source keep pointing at it.
 */
export async function updateCustomSource(
  pool,
  { sourceKey, input, canManage },
) {
  return withTransaction(pool, async (client) => {
    const locked = await lockManageableSource(client, sourceKey, canManage);
    if (locked.status !== "ok") return { status: locked.status };
    const { row } = locked;
    await client.query(SQL.update, [
      row.id,
      input.sourceName,
      input.sourceSystem,
    ]);
    await client.query(SQL.deleteFields, [row.id]);
    const fields = await insertFields(client, row.id, input.fields);
    return {
      status: "ok",
      source: customSourceFromRecord({
        ...row,
        source_name: input.sourceName,
        source_system: input.sourceSystem,
        avatar_url: null,
        fields,
      }),
    };
  });
}

/** Deletes a custom source and, through the foreign key, all of its fields. */
export async function deleteCustomSource(pool, { sourceKey, canManage }) {
  return withTransaction(pool, async (client) => {
    const locked = await lockManageableSource(client, sourceKey, canManage);
    if (locked.status !== "ok") return { status: locked.status };
    await client.query(SQL.delete, [locked.row.id]);
    return {
      status: "ok",
      sourceKey: locked.row.source_key,
      sourceName: locked.row.source_name,
    };
  });
}
