/**
 * Records the condition and action matrix (test/fixtures/condition-action-
 * matrix/cases.js) through the real app code, using the step type harness.
 *
 * For each logic step of a case it records the English, the automatic notes,
 * Developer Logic, the formulas of every dialect (with an ELSE's lead and
 * notes), and the qTest action; for the case's audit, the SQL and Python
 * scripts. Each case gets a fresh app, so no state carries between cases.
 */
import vm from "node:vm";
import { loadApp } from "./step-type-harness.js";
import { matrixGroups } from "../fixtures/condition-action-matrix/cases.js";

export const MATRIX_DIR = new URL(
  "../fixtures/condition-action-matrix/recorded/",
  import.meta.url,
);

const run = (context, code) => vm.runInContext(code, context);
const plain = (value) =>
  value === undefined ? null : JSON.parse(JSON.stringify(value));

function safely(fn) {
  try {
    return plain(fn());
  } catch (error) {
    return { error: String(error?.message || error) };
  }
}

/** The recorded outputs of one case. */
export async function recordCase(document) {
  const context = await loadApp();
  context.__matrixInput = structuredClone(document);
  run(
    context,
    `state.audit = normalizeLoadedAudit(__matrixInput, "repo");
     state.auditSelected = true;
     state.selectedStepId = null;`,
  );
  const steps = run(context, "state.audit.steps");
  const records = [];
  for (let index = 0; index < steps.length; index += 1) {
    if (steps[index].step_type === "reference_source") continue;
    context.__matrixStep = steps[index];
    context.__matrixIndex = index;
    records.push({
      id: steps[index].id,
      stepType: steps[index].step_type,
      english: safely(() => run(context, "analystLogic(__matrixStep)")),
      autoNotes: safely(() =>
        run(context, "noteText({ ...__matrixStep, notes: '' }, __matrixIndex)"),
      ),
      developer: safely(() => run(context, "developerLogic(__matrixStep)")),
      formulas: safely(() => run(context, "atlasDeveloperFormulas(__matrixStep)")),
      qtestAction: safely(() => run(context, "qtestStepAction(__matrixStep)")),
    });
  }
  return {
    steps: records,
    sqlScript: safely(() => run(context, "buildAuditSqlScript()")),
    pythonScript: safely(() => run(context, "buildAuditPythonScript()")),
  };
}

/** { caseId: record } for one group, in case order. */
export async function recordGroup(cases) {
  const recorded = {};
  for (const document of cases) recorded[document.id] = await recordCase(document);
  return recorded;
}

export { matrixGroups };
