import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(
  new URL("../js/15j-logic-text-import.js", import.meta.url),
  "utf8",
);
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(source, sandbox);

const {
  atlasParseImportedLogicText,
  atlasClassifyLogicImportSource,
  atlasSuggestLogicImportMappings,
} = sandbox;

const sample =
  'If file "sap.hi0256" column "Nationality" is equal to text values "US" or "Minor Outl. Isl." THEN do not display';

const sap = {
  sourceKey: "sap.hi0256",
  alias: "sap.hi0256",
  sourceFile: "HI0256",
  fields: [{ fieldName: "Nationality", vanityLabel: "Nationality" }],
};
const canada = {
  sourceKey: "wb.hi0256can",
  alias: "wb.hi0256can",
  sourceFile: "HI0256",
  fields: [{ fieldName: "persno" }],
};

test("sample IF/THEN sentence becomes one do-not-display condition", () => {
  const result = atlasParseImportedLogicText(sample);
  assert.equal(result.ok, true, result.message);
  assert.equal(result.stepType, "if_then");
  assert.equal(result.conditions.length, 1);
  assert.equal(result.conditions[0].sourceToken, "sap.hi0256");
  assert.equal(result.conditions[0].fieldToken, "Nationality");
  assert.equal(result.conditions[0].operator, "is equal to");
  assert.equal(result.conditions[0].valueMode, "values");
  assert.equal(result.conditions[0].compareValue, "US\nMinor Outl. Isl.");
  assert.equal(result.params.then_action_type, "do_not_display");
});

test("catalog IF/THEN wording and a second AND condition are read", () => {
  const catalog = atlasParseImportedLogicText(
    'IF file "sap.hi0256" column "Nationality" is equal to "US" or "Minor Outl. Isl." THEN do not display record.',
  );
  assert.equal(catalog.ok, true, catalog.message);
  assert.equal(catalog.conditions[0].compareValue, "US\nMinor Outl. Isl.");
  const grouped = atlasParseImportedLogicText(
    'IF file "sap.hi0256" column "Nationality" is blank AND file "wd.INT2128a" column "Assignment" is equal to column "Worker" THEN do not display',
  );
  assert.equal(grouped.ok, true, grouped.message);
  assert.equal(grouped.conditions.length, 2);
  assert.equal(grouped.conditions[0].valueMode, "blank");
  assert.equal(grouped.conditions[1].connector, "AND");
  assert.equal(grouped.conditions[1].valueMode, "field");
  assert.equal(grouped.conditions[1].compareFieldToken, "Worker");
});

test("reference, join, union, and create column sentences keep their step types", () => {
  const reference = atlasParseImportedLogicText(
    'Reference source file "HI0256_Maseke" as "sap.hi0256":',
  );
  assert.equal(reference.ok, true, reference.message);
  assert.equal(reference.stepType, "reference_source");
  assert.equal(reference.references[0].token, "sap.hi0256");
  assert.ok(reference.references[0].matchTokens.includes("HI0256_Maseke"));

  const join = atlasParseImportedLogicText(
    'Join file "sap.hi0256" column "Nationality" and file "wd.INT2128a" column "Assignment".',
  );
  assert.equal(join.ok, true, join.message);
  assert.equal(join.stepType, "join");
  assert.equal(join.params.join_type, "INNER JOIN");
  assert.equal(join.references[0].token, "sap.hi0256");
  assert.equal(join.references[1].token, "Nationality");

  const union = atlasParseImportedLogicText(
    'UNION file "Left File" and file "Right File", reference as file "Combined"',
  );
  assert.equal(union.ok, true, union.message);
  assert.equal(union.params.join_type, "UNION");
  assert.equal(
    union.references.map((item) => String(item.token)).join("|"),
    "Left File|Right File|Combined",
  );

  const staticColumn = atlasParseImportedLogicText(
    'Create new column "Error Message" and set value to "Missing".',
  );
  assert.equal(staticColumn.ok, true, staticColumn.message);
  assert.equal(staticColumn.params.value_mode, "Static value");
  assert.equal(staticColumn.params.column_name, "Error Message");
  assert.equal(staticColumn.params.static_value, "Missing");

  const sourceField = atlasParseImportedLogicText(
    'Create new column "Worker" using file "wd.INT2128a" column "Assignment".',
  );
  assert.equal(sourceField.ok, true, sourceField.message);
  assert.equal(sourceField.params.value_mode, "Source field value");
  assert.equal(sourceField.params.column_name, "Worker");
  assert.equal(sourceField.references[0].token, "wd.INT2128a");
  assert.equal(sourceField.references[1].token, "Assignment");
});

test("format, sort, split, duplicates, filter, and flag sentences are recognized", () => {
  const format = atlasParseImportedLogicText(
    'Format file "sap.hi0256" column "Nationality" as text.',
  );
  assert.equal(format.stepType, "format_field");
  assert.equal(format.params.format, "text");

  const sort = atlasParseImportedLogicText(
    'Sort records by file "sap.hi0256" column "Nationality" in Descending order.',
  );
  assert.equal(sort.stepType, "sort_records");
  assert.equal(sort.params.sort_direction, "Descending");

  const split = atlasParseImportedLogicText(
    'Split file "sap.hi0256" column "Nationality" on the "-" and display first value in column "Code".',
  );
  assert.equal(split.ok, true, split.message);
  assert.equal(split.stepType, "split_field");
  assert.equal(split.params.split_on, "-");
  assert.equal(split.params.output_column, "Code");

  const duplicates = atlasParseImportedLogicText(
    'If file "sap.hi0256" column "Nationality" value appears more than once in the column, Keep first record.',
  );
  assert.equal(duplicates.stepType, "remove_duplicates");
  assert.equal(duplicates.params.duplicate_action, "Keep first record");

  const filter = atlasParseImportedLogicText(
    'IF file "sap.hi0256" column "Nationality" is equal to "US", THEN Keep matching rows.',
  );
  assert.equal(filter.ok, true, filter.message);
  assert.equal(filter.stepType, "filter_rows");
  assert.equal(filter.params.filter_action, "Keep matching rows");

  const flag = atlasParseImportedLogicText(
    'IF file "sap.hi0256" column "Nationality" is equal to "US", THEN do NOT display record.',
  );
  assert.equal(flag.ok, true, flag.message);
  assert.equal(flag.stepType, "flag_records");
  assert.equal(flag.params.flag_action, "do_not_display");
});

test("mixed connectors and unrecognized sentences fail with a message", () => {
  const mixed = atlasParseImportedLogicText(
    'IF file "a" column "b" is equal to "1" AND file "a" column "c" is equal to "2" OR file "a" column "d" is equal to "3" THEN do not display',
  );
  assert.equal(mixed.ok, false);
  assert.match(mixed.message, /Mixed AND and OR/);

  const unknown = atlasParseImportedLogicText("Please hide these rows");
  assert.equal(unknown.ok, false);
  assert.match(unknown.message, /could not be read/);
});

test("mapping preselects an in-use alias and leaves collisions unresolved", () => {
  const draft = atlasParseImportedLogicText(sample);
  const suggestions = atlasSuggestLogicImportMappings(draft, {
    selectedSources: [sap],
    librarySources: [sap, canada],
  });
  const source = suggestions.find((item) => item.kind === "source");
  const field = suggestions.find((item) => item.kind === "field");
  assert.equal(source.status, "in-use");
  assert.equal(source.source.sourceKey, "sap.hi0256");
  assert.equal(field.fieldName, "Nationality");

  const libraryOnly = atlasClassifyLogicImportSource("sap.hi0256", {
    selectedSources: [],
    librarySources: [sap],
  });
  assert.equal(libraryOnly.status, "library");
  assert.equal(libraryOnly.eligibleToUse, true);

  const collision = atlasClassifyLogicImportSource("HI0256", {
    selectedSources: [],
    librarySources: [sap, canada],
  });
  assert.equal(collision.status, "ambiguous-library");
  assert.equal(collision.source, null);
  assert.equal(collision.eligibleToUse, false);

  const missing = atlasClassifyLogicImportSource("not.a.source", {
    selectedSources: [],
    librarySources: [sap, canada],
  });
  assert.equal(missing.status, "unknown");
  assert.equal(missing.eligibleToUse, false);
});

test("mapping source and field controls open the visual picker and keep the chosen values", () => {
  const colored = { ...sap, color: "#123456" };
  const sourceHtml = sandbox.atlasLogicImportPickerButtonHtml({
    kind: "source",
    targetId: "c0-source",
    value: "sap.hi0256",
    source: colored,
    ariaLabel: "Source for sap.hi0256",
    hiddenAttribute: 'data-import-source="c0-source"',
  });
  const fieldHtml = sandbox.atlasLogicImportPickerButtonHtml({
    kind: "field",
    targetId: "c0-field",
    value: "Nationality",
    source: colored,
    sourceRef: "c0-source",
    ariaLabel: "Column for Nationality",
    hiddenAttribute: 'data-import-field="c0-field" data-source-ref="c0-source"',
  });
  assert.match(sourceHtml, /data-logic-import-picker="source"/);
  assert.match(fieldHtml, /data-logic-import-picker="field"/);
  assert.match(
    sourceHtml,
    /data-import-source="c0-source" value="sap\.hi0256"/,
  );
  assert.match(
    fieldHtml,
    /data-import-field="c0-field"[^>]*value="Nationality"/,
  );
  assert.match(sourceHtml, /--source-color:#123456/);
  assert.match(fieldHtml, /<strong>Nationality<\/strong>/);
  assert.doesNotMatch(sourceHtml, /<select/);
  assert.doesNotMatch(fieldHtml, /<select/);

  const sourceInput = { value: "", dataset: { importSource: "c0-source" } };
  const fieldInput = {
    value: "",
    dataset: { importField: "c0-field", sourceRef: "c0-source" },
    parentElement: null,
  };
  const fieldButton = {
    disabled: true,
    dataset: { logicImportPicker: "field", sourceRef: "c0-source" },
    classList: { toggle() {} },
    style: { setProperty() {}, removeProperty() {} },
    querySelector() {
      return null;
    },
    setAttribute() {},
    prepend() {},
  };
  fieldInput.parentElement = { querySelector: () => fieldButton };
  fieldButton.parentElement = { querySelector: () => fieldInput };
  const sourceButton = {
    disabled: false,
    dataset: { logicImportPicker: "source", logicImportTarget: "c0-source" },
    parentElement: { querySelector: () => sourceInput },
    classList: { toggle() {} },
    style: { setProperty() {}, removeProperty() {} },
    querySelector() {
      return null;
    },
    setAttribute() {},
    prepend() {},
  };
  sandbox.state = { audit: { sources: [colored] } };
  sandbox.document = {
    createElement() {
      return { className: "", textContent: "", setAttribute() {} };
    },
    getElementById() {
      return null;
    },
    querySelector(selector) {
      if (String(selector).includes("data-import-source")) return sourceInput;
      return null;
    },
    querySelectorAll(selector) {
      if (String(selector).includes("data-import-field")) return [fieldInput];
      return [];
    },
  };
  let opened = null;
  sandbox.window = {
    ATLASVisualPicker: {
      open(config) {
        opened = config;
        return true;
      },
    },
  };
  sandbox.atlasLogicImportOpenPicker(sourceButton);
  assert.equal(opened.mode, "source");
  assert.equal(opened.hideLabelMode, true);
  assert.equal(opened.entries[0].pickerValue, "sap.hi0256");
  assert.equal(opened.entries[0].sourceColor, "#123456");
  assert.equal(opened.entries[0].label, "sap.hi0256 (HI0256)");
  opened.onSelect(opened.entries[0]);
  assert.equal(sourceInput.value, "sap.hi0256");
  assert.equal(fieldInput.value, "Nationality");
  assert.equal(fieldButton.disabled, false);

  sandbox.atlasLogicImportOpenPicker(fieldButton);
  assert.equal(opened.mode, "field");
  assert.equal(opened.hideLabelMode, false);
  const nationality = opened.entries.find(
    (entry) => entry.rawName === "Nationality",
  );
  assert.ok(nationality);
  assert.equal(nationality.pickerValue, "Nationality");
  assert.equal(nationality.sourceColor, "#123456");
  assert.equal(nationality.sourceKey, "sap.hi0256");
  opened.onSelect({ ...nationality, pickerValue: "Nationality" });
  assert.equal(fieldInput.value, "Nationality");
});
