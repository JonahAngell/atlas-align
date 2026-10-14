import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const source = readFileSync(
  new URL("../src/audit-preview-repository.js", import.meta.url),
  "utf8",
);
test("preview repository remains SELECT-only and transaction-free", () => {
  assert.doesNotMatch(
    source,
    /\b(INSERT|UPDATE|DELETE)\b\s+(INTO|FROM|atlas_)/i,
  );
  assert.doesNotMatch(
    source,
    /FOR UPDATE|query\("BEGIN"\)|query\("COMMIT"\)|query\("ROLLBACK"\)/,
  );
});
test("token parsing is exported for transaction-bound validation", () => {
  assert.match(source, /export function readRestorationPreviewToken/);
  assert.match(
    source,
    /export async function verifyRestorationPreviewWithClient/,
  );
  assert.match(source, /timingSafeEqual/);
});
test("authoritative validation accepts the locked current row", () => {
  assert.match(source, /currentRow = null/);
  assert.match(source, /currentRow \|\| \(await current\(client, auditId\)\)/);
});

test("approval preview returns detached submitted document and validates revision identity", () => {
  assert.match(source, /expectedSubmittedRevisionId/);
  assert.match(source, /submittedRevision:/);
  assert.match(source, /structuredClone\(x\.document\)/);
});
