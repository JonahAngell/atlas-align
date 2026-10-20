import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (file) =>
  readFileSync(new URL(`../js/${file}`, import.meta.url), "utf8");

test("startup requests the library alongside the essential data", () => {
  const source = read("06-events-bootstrap.js");
  const init = source.slice(source.indexOf("async function init()"));
  const library = init.indexOf("loadRepoLibrary?.(");
  const essential = init.indexOf("await Promise.allSettled([");
  assert.ok(library > 0 && library < essential);
  assert.match(init, /const repoLibraryStartup = Promise\.allSettled\(\[/);
});

test("a field library outage is a startup warning, not a stalled startup", () => {
  const init = read("06-events-bootstrap.js");
  assert.match(init, /\[\.\.\.essentialStartup, libraryStartup\]\.filter\(/);
  assert.ok(
    init.indexOf("const [libraryStartup] = await repoLibraryStartup;") <
      init.indexOf("atlasSetApplicationReady(true)"),
  );
});

test("the field library is fetched in parallel with the catalogs", () => {
  const library = read("11-repo-library.js");
  const body = library.slice(library.indexOf("async function loadRepoLibrary"));
  const start = body.indexOf("const sourceFiles = loadSourceFileLibrary();");
  const catalogs = body.indexOf("await Promise.all([");
  assert.ok(start > 0 && start < catalogs);
  assert.match(body, /await sourceFiles;/);
});
