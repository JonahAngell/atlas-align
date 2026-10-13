import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const server = [
  "../server.js",
  "../src/routes/identity-routes.js",
]
  .map((file) => readFileSync(new URL(file, import.meta.url), "utf8"))
  .join("\n");
test("validation requires preview and a literal true flag", () => {
  assert.match(server, /STUDIOSHARE_APP_ENV[\s\S]*preview/);
  assert.match(server, /ATLAS_IN_APP_VALIDATION_ENABLED/);
  assert.match(server, /toLowerCase\(\) === "true"/);
});
test("disabled validation definition is not served", () => {
  assert.match(
    server,
    /if \(!inAppValidationEnabled\(\)\)[\s\S]*status\(404\)/,
  );
  assert.match(server, /requireCurrentUser/);
});
