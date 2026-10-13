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
});

export async function listCustomSourceKeys(pool) {
  const result = await pool.query(SQL.listKeys);
  return result.rows.map((row) => row.source_key);
}

export async function listCustomSources(pool) {
  const result = await pool.query(SQL.list);
  return result.rows.map((row) => customSourceFromRecord(row));
}

export async function insertCustomSource(pool, { sourceKey, input, createdBy }) {
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
    const fields = [];
    for (const [index, field] of input.fields.entries()) {
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
