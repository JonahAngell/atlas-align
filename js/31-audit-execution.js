/**
 * 31-audit-execution.js
 *
 * Run settings for the whole audit, shown on the Overview page and stored as
 * `audit.execution`. File Utility reads them (atlas_compile.py `execution()`).
 * Only settings that differ from File Utility's defaults are stored, so an
 * audit that never changes them keeps no `execution` block.
 */

const ATLAS_EXECUTION_DEFAULTS = Object.freeze({
  resultRows: "all_except_excluded",
  textCombine: "append",
  textSeparator: "; ",
  resultSource: "",
});
const ATLAS_EXECUTION_RESULT_ROWS = [
  [
    "all_except_excluded",
    "All records",
    "Every record except those a Do Not Display step hides.",
  ],
  [
    "only_flagged",
    "Only flagged records",
    "Only records that a Display Text step wrote a message on.",
  ],
];
const ATLAS_EXECUTION_TEXT_COMBINE = [
  [
    "append",
    "Add to earlier text",
    "Keep earlier messages and add the new one after the separator.",
  ],
  ["last", "Keep the last text", "Replace earlier messages with the new one."],
];
const ATLAS_EXECUTION_MAX_SEPARATOR = 10;

/** Sources the result can come from, as [alias, label] pairs. */
function atlasExecutionSourceChoices(audit = {}) {
  const seen = new Set();
  return (Array.isArray(audit.sources) ? audit.sources : [])
    .map((source) => {
      const file = source?.sourceFile || source?.name || "";
      const alias =
        (typeof sourceAliasFor === "function" && file
          ? sourceAliasFor(file)
          : "") ||
        source?.alias ||
        file;
      return [String(alias || ""), String(file || alias || "")];
    })
    .filter(([alias]) => alias && !seen.has(alias) && seen.add(alias));
}

/** The audit's run settings, with File Utility's defaults filled in. */
function atlasExecutionSettings(audit = {}) {
  const stored =
    audit.execution && typeof audit.execution === "object"
      ? audit.execution
      : {};
  return { ...ATLAS_EXECUTION_DEFAULTS, ...stored };
}

/**
 * Keeps only the settings that differ from the defaults.
 * Returns null when nothing differs.
 */
function atlasNormalizeExecution(settings = {}) {
  const out = {};
  Object.keys(ATLAS_EXECUTION_DEFAULTS).forEach((key) => {
    const value = settings[key];
    if (value === undefined || value === null) return;
    const text = String(value);
    // A blank separator means "use the default", which is never blank.
    if (key === "textSeparator" && text === "") return;
    if (key !== "textSeparator" && text.trim() === "") return;
    if (text !== ATLAS_EXECUTION_DEFAULTS[key]) out[key] = text;
  });
  return Object.keys(out).length ? out : null;
}

/** Problems that would stop File Utility from running the settings. */
function atlasExecutionProblems(audit = {}) {
  const settings = atlasExecutionSettings(audit);
  const problems = [];
  const values = (list) => list.map(([value]) => value);
  if (!values(ATLAS_EXECUTION_RESULT_ROWS).includes(settings.resultRows))
    problems.push("Choose which records the result shows.");
  if (!values(ATLAS_EXECUTION_TEXT_COMBINE).includes(settings.textCombine))
    problems.push("Choose how display text messages combine.");
  const separator = String(settings.textSeparator ?? "");
  if (separator.length < 1 || separator.length > ATLAS_EXECUTION_MAX_SEPARATOR)
    problems.push(
      `Use a message separator of 1 to ${ATLAS_EXECUTION_MAX_SEPARATOR} characters.`,
    );
  if (
    settings.resultSource &&
    !values(atlasExecutionSourceChoices(audit)).includes(settings.resultSource)
  )
    problems.push(
      "The result source is not one of the audit's sources. Choose another source.",
    );
  return problems;
}

/** The description of the selected choice. */
function atlasExecutionChoiceHint(options, selected) {
  return (options.find(([value]) => value === selected) || options[0])[2];
}

/** The Overview card body. */
function atlasExecutionCardHtml(audit = {}) {
  const settings = atlasExecutionSettings(audit);
  const sources = atlasExecutionSourceChoices(audit);
  const sourceOptions = [["", "Last step's table"], ...sources];
  if (
    settings.resultSource &&
    !sources.some(([alias]) => alias === settings.resultSource)
  )
    sourceOptions.push([
      settings.resultSource,
      `${settings.resultSource} (not loaded)`,
    ]);
  const problems = atlasExecutionProblems(audit);
  const separator = String(audit.execution?.textSeparator ?? "");
  return `<div class="atlas-choice-field"><span class="atlas-choice-heading">Records in the result</span>${atlasChoiceControl(
    {
      options: ATLAS_EXECUTION_RESULT_ROWS.map(([value, label]) => [
        value,
        label,
      ]),
      selected: settings.resultRows,
      variant: "segment",
      label: "Records in the result",
      attributes: 'data-execution-setting="resultRows"',
    },
  )}<small class="hint">${esc(atlasExecutionChoiceHint(ATLAS_EXECUTION_RESULT_ROWS, settings.resultRows))}</small></div><div class="atlas-choice-field"><span class="atlas-choice-heading">Display text messages</span>${atlasChoiceControl(
    {
      options: ATLAS_EXECUTION_TEXT_COMBINE.map(([value, label]) => [
        value,
        label,
      ]),
      selected: settings.textCombine,
      variant: "segment",
      label: "Display text messages",
      attributes: 'data-execution-setting="textCombine"',
    },
  )}<small class="hint">${esc(atlasExecutionChoiceHint(ATLAS_EXECUTION_TEXT_COMBINE, settings.textCombine))}</small></div><label>Message separator<input data-execution-setting="textSeparator" value="${esc(separator)}" maxlength="${ATLAS_EXECUTION_MAX_SEPARATOR}" placeholder='Default "; "' aria-describedby="atlasExecutionSeparatorHint"><small class="hint" id="atlasExecutionSeparatorHint">Placed between messages when they are added together. Leave blank for "; ". A Display Text step's own separator is used in ATLAS logic text only.</small></label><label>Result source<select data-execution-setting="resultSource">${sourceOptions
    .map(
      ([value, label]) =>
        `<option value="${esc(value)}"${value === settings.resultSource ? " selected" : ""}>${esc(label)}</option>`,
    )
    .join(
      "",
    )}</select><small class="hint">The table whose records make up the result.</small></label>${
    problems.length
      ? `<p class="hint atlas-field-error" role="alert">${problems.map(esc).join(" ")}</p>`
      : ""
  }`;
}

function atlasRenderExecutionCard() {
  const body = document.getElementById("atlasExecutionCardBody");
  if (!body || typeof atlasChoiceControl !== "function") return;
  const audit =
    (typeof atlasDisplayDocument === "function" && atlasDisplayDocument()) ||
    state.audit;
  body.innerHTML = atlasExecutionCardHtml(audit || {});
}

/** Reads the card into `state.audit.execution`. Returns true when it changed. */
function atlasCaptureExecution() {
  const body = document.getElementById("atlasExecutionCardBody");
  if (!body || !state?.audit) return false;
  const inputs = body.querySelectorAll("[data-execution-setting]");
  if (!inputs.length) return false;
  const settings = { ...atlasExecutionSettings(state.audit) };
  inputs.forEach((input) => {
    settings[input.dataset.executionSetting] = input.value;
  });
  if (!body.querySelector('[data-execution-setting="textSeparator"]')?.value)
    settings.textSeparator = "";
  const next = atlasNormalizeExecution(settings);
  const before = JSON.stringify(state.audit.execution || null);
  if (next) state.audit.execution = next;
  else delete state.audit.execution;
  return before !== JSON.stringify(next);
}

if (typeof capture === "function") {
  const atlasCaptureBeforeExecution = capture;
  capture = function captureWithExecution(...args) {
    const result = atlasCaptureBeforeExecution.apply(this, args);
    atlasCaptureExecution();
    return result;
  };
}

if (typeof renderHeader === "function") {
  const atlasRenderHeaderBeforeExecution = renderHeader;
  renderHeader = function renderHeaderWithExecution(...args) {
    const result = atlasRenderHeaderBeforeExecution.apply(this, args);
    atlasRenderExecutionCard();
    return result;
  };
}

if (typeof document !== "undefined")
  document.addEventListener("change", (event) => {
    if (
      !event.target.closest?.(
        "#atlasExecutionCardBody [data-execution-setting]",
      )
    )
      return;
    if (!atlasCaptureExecution()) return;
    globalThis.ATLASAuditIssues?.invalidate?.();
    scheduleAutosave?.();
    atlasRenderExecutionCard();
  });
