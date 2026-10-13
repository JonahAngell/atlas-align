import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const phraseSource = fs.readFileSync("js/07-phrase-catalog.js", "utf8");
const builderSource = fs.readFileSync(
  "js/14-catalog-driven-builder.js",
  "utf8",
);
const editorSource = fs.readFileSync("js/15e-logic-step-editor.js", "utf8");
const cssSource = fs.readFileSync("css/logic-builder.css", "utf8");
const phraseCatalog = JSON.parse(
  fs.readFileSync("catalogs/logic_phrase_catalog.json", "utf8"),
);

function declaration(name) {
  const start = phraseSource.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} declaration should exist`);
  const bodyStart = phraseSource.indexOf("{", start);
  let depth = 0;
  for (let index = bodyStart; index < phraseSource.length; index += 1) {
    if (phraseSource[index] === "{") depth += 1;
    if (phraseSource[index] === "}") depth -= 1;
    if (depth === 0) return phraseSource.slice(start, index + 1);
  }
  throw new Error(`Unable to extract ${name}`);
}

const roundingContext = {
  renderCatalogPhrase(path, values = {}) {
    const template = path.split(".").reduce((current, key) => current?.[key], phraseCatalog);
    return String(template || "").replace(/\{([A-Za-z0-9_.-]+)\}/g, (match, key) =>
      Object.prototype.hasOwnProperty.call(values, key) ? String(values[key] ?? "") : match,
    );
  },
};
vm.runInNewContext(
  [
    declaration("atlasRoundingTargetText"),
    declaration("atlasRoundingDirectionText"),
    declaration("atlasMathRoundingPhrase"),
  ].join("\n"),
  roundingContext,
);

test("rounding wording preserves whole-number text and removes unwanted the for decimals", () => {
  assert.equal(
    roundingContext.atlasMathRoundingPhrase("nearest", "0"),
    ", then round to the nearest whole number",
  );
  const cases = [
    ["nearest", "1", ", then round to 1 decimal place"],
    ["nearest", "2", ", then round to 2 decimal places"],
    ["up", "1", ", then round up to 1 decimal place"],
    ["up", "2", ", then round up to 2 decimal places"],
    ["down", "1", ", then round down to 1 decimal place"],
    ["down", "2", ", then round down to 2 decimal places"],
  ];
  for (const [mode, decimals, expected] of cases)
    assert.equal(
      roundingContext.atlasMathRoundingPhrase(mode, decimals),
      expected,
    );
});

test("Concatenate wording and placeholders use the requested copy", () => {
  assert.equal(
    phraseCatalog.analyst_logic.create_column.concatenate_fields,
    "Create new column {column_name} by concatenating {first_column} and {second_column}.",
  );
  assert.match(builderSource, /placeholder: "Select first field"/);
  assert.match(builderSource, /placeholder: "Select second field"/);
});

test("Character Count omits explanatory UI copy without changing transform behavior", () => {
  assert.doesNotMatch(
    builderSource,
    /Returns the number of characters\. Blank text returns 0; null remains blank\/NULL\./,
  );
  assert.match(
    builderSource,
    /if \(operation === "character_count"\) return "";/,
  );
});

test("Concatenate controls use the responsive two-column layout", () => {
  assert.match(builderSource, /<div class="logic-picker-pair">/);
  assert.match(
    cssSource,
    /\.logic-picker-pair\s*\{[\s\S]*grid-template-columns: repeat\(2,/,
  );
  assert.match(
    cssSource,
    /@media \(max-width: 720px\)[\s\S]*\.logic-picker-pair/,
  );
});

test("created columns receive the canonical blue token classification", () => {
  assert.match(editorSource, /kind: "created"/);
  assert.match(editorSource, /logic-pill created-column-token/);
  assert.match(
    cssSource,
    /\.created-column-token\s*\{[\s\S]*background: #2563eb/,
  );
  assert.match(
    cssSource,
    /@media \(forced-colors: active\)[\s\S]*\.created-column-token/,
  );
});
