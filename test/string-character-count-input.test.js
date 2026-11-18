/**
 * The Number of Characters box in a String transformation. The live editor
 * refuses to save while the box holds a bad value, so a blank box (how every
 * new First or Last characters transformation starts) must not count as bad:
 * that stopped every edit to the step, even switching the operation.
 */
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { loadApp } from "./support/step-type-harness.js";

/** A stand-in for the count input that records what the editor sets on it. */
function countInput(value) {
  return {
    value,
    attributes: {},
    validity: "",
    matches: (selector) => selector.includes("string_character_count"),
    setAttribute(name, next) {
      this.attributes[name] = next;
    },
    setCustomValidity(message) {
      this.validity = message;
    },
    reportValidity() {},
  };
}

async function check(value) {
  const context = await loadApp();
  context.__input = countInput(value);
  const valid = vm.runInContext(
    "atlasValidateStringCharacterCountInput(__input, { report: true })",
    context,
  );
  return { valid, input: context.__input };
}

for (const value of ["", "  "])
  test(`a blank count (${JSON.stringify(value)}) lets the step save`, async () => {
    const { valid, input } = await check(value);
    assert.equal(valid, true);
    assert.equal(input.attributes["aria-invalid"], "false");
    assert.equal(input.validity, "");
  });

for (const value of ["0", "-2", "1.5", "abc"])
  test(`a count of ${JSON.stringify(value)} still blocks the save`, async () => {
    const { valid, input } = await check(value);
    assert.equal(valid, false);
    assert.equal(input.attributes["aria-invalid"], "true");
    assert.match(input.validity, /positive whole number/);
  });

test("a valid count saves", async () => {
  const { valid } = await check("3");
  assert.equal(valid, true);
});

test("the validation panel still asks for a blank count", async () => {
  const context = await loadApp();
  const issues = vm.runInContext(
    `atlasValidateStringTransform({
      string_operation: "first_characters",
      string_source_file: "wd",
      string_source_field: "Email",
      string_character_count: "",
      target_column: "Email Start",
    })`,
    context,
  );
  assert.ok(issues.some((issue) => issue.code === "string_count"));
});
