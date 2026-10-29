import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const picker = fs
  .readFileSync(new URL("../js/10-field-picker.js", import.meta.url), "utf8")
  .replace(/\r\n/g, "\n");

// The resolver and its memo sit at the top of the file, before any code that
// needs a DOM.
function loadResolver(sourceFiles) {
  const end = picker.indexOf("let atlasSourceDerivedVersion");
  assert.notEqual(end, -1);
  const context = { repoLibraryState: { sourceFiles } };
  vm.createContext(context);
  vm.runInContext(
    `${picker.slice(0, end)}\nthis.resolve = atlasResolveSourceIdentity;`,
    context,
  );
  return context;
}

const catalog = () => [
  { sourceKey: "one", sourceFile: "One.csv", alias: "S1", name: "One" },
  { sourceKey: "two", sourceFile: "Two.csv", alias: "S2", name: "Two" },
];

test("source identity follows in-place catalog edits", () => {
  const sources = catalog();
  const { resolve } = loadResolver(sources);
  assert.equal(resolve("S2").sourceKey, "two");
  sources[1].alias = "Renamed";
  assert.equal(resolve("S2").catalogSource.sourceKey, undefined);
  assert.equal(resolve("Renamed").sourceKey, "two");
  sources.push({ sourceKey: "three", alias: "S3" });
  assert.equal(resolve("S3").sourceKey, "three");
  sources[0] = { sourceKey: "uno", alias: "S1" };
  assert.equal(resolve("S1").sourceKey, "uno");
});

test("remembered identities cannot be changed by callers", () => {
  const { resolve } = loadResolver(catalog());
  resolve("S1").sourceKey = "changed";
  assert.equal(resolve("S1").sourceKey, "one");
});

test("identities are remembered separately for an explicit catalog", () => {
  const { resolve } = loadResolver(catalog());
  const other = [{ sourceKey: "elsewhere", alias: "S1" }];
  assert.equal(resolve("S1", other).sourceKey, "elsewhere");
  assert.equal(resolve("S1").sourceKey, "one");
});

test("ambiguous references stay ambiguous", () => {
  const sources = catalog();
  sources.push({ sourceKey: "dup", alias: "S1" });
  const { resolve } = loadResolver(sources);
  assert.equal(resolve("S1").ambiguous, true);
  assert.equal(resolve("S1").ambiguous, true);
});
