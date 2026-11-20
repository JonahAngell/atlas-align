/**
 * docs/copilot/ holds the Microsoft 365 Copilot agent: an instructions block,
 * knowledge files and skills. These tests keep it importable and current:
 * the instructions fit the agent builder's limit, the generated step type
 * reference matches the repository, the audit format's complete example
 * imports and renders, the authoring guide's example definition passes the
 * registry, and every skill is a well-formed SKILL.md.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import vm from "node:vm";
import { buildReference, zip } from "../tools/build-copilot-agent.mjs";
import { checkStepTypeDefinitions } from "../src/step-type-engine.js";
import { loadApp, recordAudit } from "./support/step-type-harness.js";

const COPILOT = new URL("../docs/copilot/", import.meta.url);
const read = (path) => readFileSync(new URL(path, COPILOT), "utf8");
const SKILLS = readdirSync(new URL("skills/", COPILOT));
const KNOWLEDGE = readdirSync(new URL("knowledge/", COPILOT));

/** The first ```json block after `heading` in a Markdown file. */
function jsonAfter(markdown, heading) {
  const part = markdown.split(heading)[1];
  assert.ok(part, `${heading} is in the file`);
  return JSON.parse(part.match(/```json\n([\s\S]*?)\n```/)[1]);
}

test("the instructions fit the agent builder's 8,000-character box", () => {
  const text = read("INSTRUCTIONS.md");
  assert.ok(text.length <= 8000, `${text.length} characters`);
  assert.match(text, /<SHAREPOINT_FOLDER>/);
});

test("the step type reference matches the repository", async () => {
  assert.equal(
    read("knowledge/STEP_TYPE_REFERENCE.md"),
    await buildReference(),
    "Run: npm run copilot:build",
  );
});

test("the audit format's complete example imports and every step renders", async () => {
  const json = jsonAfter(
    read("knowledge/AUDIT_JSON_FORMAT.md"),
    "## 7. Complete example",
  );
  const context = await loadApp();
  context.__importJson = json;
  const documents = vm.runInContext(
    "atlasAuditDocumentsFromJson(__importJson)",
    context,
  );
  assert.equal(documents.length, 1);
  const recorded = JSON.parse(JSON.stringify(await recordAudit(context, json)));
  assert.equal(recorded.steps.length, json.steps.length);
  for (const step of vm.runInContext("state.audit.steps", context)) {
    context.__step = step;
    const definition = vm.runInContext(
      "ATLASStepTypeRuntime.definitionFor(__step)",
      context,
    );
    assert.ok(definition, `${step.id} has a step type`);
  }
  for (const step of recorded.steps) {
    assert.ok(step.english, `${step.id} has English`);
    assert.doesNotMatch(step.english, /\[[a-z ]+\]|Missing/, step.id);
  }
});

test("the authoring guide's example definition passes the registry", () => {
  const definition = jsonAfter(
    read("knowledge/STEP_TYPE_AUTHORING.md"),
    "## 7. A complete example",
  );
  const schema = JSON.parse(
    readFileSync(
      new URL("../catalogs/step-types/schema.json", import.meta.url),
      "utf8",
    ),
  );
  const { rejected } = checkStepTypeDefinitions(schema, [definition]);
  assert.deepEqual(rejected, []);
  assert.ok(definition.tests.length > 0);
});

test("each skill is a SKILL.md whose name matches its folder", () => {
  assert.ok(
    SKILLS.length >= 1 && SKILLS.length <= 7,
    `${SKILLS.length} skills`,
  );
  for (const name of SKILLS) {
    const text = read(`skills/${name}/SKILL.md`);
    const front = text.match(/^---\nname: (.+)\ndescription: (.+)\n---\n/);
    assert.ok(front, `${name} has name and description front matter`);
    assert.equal(front[1], name);
    assert.ok(front[2].length <= 1024, `${name} description is short`);
  }
});

test("every knowledge file and skill the agent names exists", () => {
  const texts = [
    read("INSTRUCTIONS.md"),
    ...KNOWLEDGE.map((file) => read(`knowledge/${file}`)),
    ...SKILLS.map((name) => read(`skills/${name}/SKILL.md`)),
  ].join("\n");
  for (const [, file] of texts.matchAll(/`([A-Z_]+\.md)`/g))
    assert.ok(KNOWLEDGE.includes(file), `${file} is a knowledge file`);
  for (const [, skill] of texts.matchAll(/`(atlas-[a-z-]+)` skill/g))
    assert.ok(SKILLS.includes(skill), `${skill} is a skill`);
  assert.ok(existsSync(new URL("README.md", COPILOT)));
});

test("skill zips hold the skill folder", () => {
  const archive = zip([{ name: "a/SKILL.md", data: Buffer.from("hi") }]);
  assert.equal(archive.readUInt32LE(0), 0x04034b50);
  assert.ok(archive.includes(Buffer.from("a/SKILL.md")));
});
