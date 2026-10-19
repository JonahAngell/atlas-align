/**
 * 00-config-utils.js
 *
 * Core application constants and low-level utility helpers used by the browser-only ATLAS Align app.
 * This file should stay dependency-free because many later scripts rely on these helpers during startup.
 * Auto-generated documentation comments explain function purpose, expected inputs, and module sections without changing runtime behavior.
 */

// -----------------------------------------------------------------------------
// Application constants
// -----------------------------------------------------------------------------
const ATLAS_APP_NAME = "ATLAS Align";
const ATLAS_APP_VERSION = "v3.1.1";

/** Populates application-version display targets from the authoritative constant. */
function atlasRenderAppVersion() {
  document.querySelectorAll("[data-atlas-app-version]").forEach((target) => {
    target.textContent = ATLAS_APP_VERSION;
  });
}

atlasRenderAppVersion();

// Used for IndexedDB Autosave/restore
const ATLAS_DB_NAME = "atlasAlignAuditLogicBuilder";
const ATLAS_DB_VERSION = 1;
const ATLAS_FLOW_STORE = "flows";
const ATLAS_AUTOSAVE_ID = "autosave";

// -----------------------------------------------------------------------------
// DOM and formatting utilities
// -----------------------------------------------------------------------------
/**
 * Returns a DOM element by id.
 * @param {any} id - Element id or record id to look up.
 */
const $ = (id) => document.getElementById(id);

/**
 * Escapes text for safe insertion into HTML strings.
 * @param {any} s - Input used by esc.
 */
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );

/**
 * Generates a short unique id with the requested prefix.
 * @param {any} prefix - Action label prefix such as THEN or ELSE.
 */
const uid = (prefix) =>
  `${prefix}_${crypto.randomUUID?.().slice(0, 8) || Date.now()}`;

/**
 * Returns today as an ISO date string.
 */
const today = () => new Date().toISOString().slice(0, 10);

/**
 * Escapes a value for a CSV cell.
 * @param {any} s - Input used by csvEscape.
 */
const csvEscape = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;

/**
 * Creates and downloads a browser Blob as a file.
 * @param {any} name - Name, filename, or key used by the operation.
 * @param {any} content - File contents or text payload to download.
 * @param {any} type - MIME type, step type, or classification value.
 */
function downloadBlob(name, content, type) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

/**
 * Downloads an object as formatted JSON.
 * @param {any} name - Name, filename, or key used by the operation.
 * @param {any} obj - Object to serialize.
 */
function downloadJson(name, obj) {
  downloadBlob(name, JSON.stringify(obj, null, 2), "application/json");
}

// -----------------------------------------------------------------------------
// Legacy logic text helpers
// -----------------------------------------------------------------------------
/**
 * Maps an internal legacy step type to a user-facing label.
 * @param {any} type - MIME type, step type, or classification value.
 */
function stepTypeLabel(type) {
  return (
    {
      source: "Source",
      create: "Create Field",
      if: "If / Then",
      compare: "Compare",
      join: "Join",
      transform: "Manipulation",
    }[type] || type
  );
}

/**
 * Formats a legacy condition object as a plain sentence fragment.
 * @param {any} condition - Condition object to format or render.
 */
function conditionText(condition) {
  return `${condition.field || "[field]"} ${condition.operator || "equals"} ${condition.value || "[value]"}`;
}

/**
 * Returns the first A-Z letter for alpha rails and grouped lists, or # for non-letters.
 * @param {any} value - Value to read.
 */
function firstLetter(value) {
  const c = String(value || "")
    .trim()
    .charAt(0)
    .toUpperCase();
  return /[A-Z]/.test(c) ? c : "#";
}

/**
 * Sorts items by a display name without mutating the original array.
 * @param {Array<any>} items - Items to sort.
 * @param {Function} getName - Name selector.
 */
function alphaSortItems(items, getName) {
  return [...items].sort((a, b) =>
    String(getName(a) || "").localeCompare(
      String(getName(b) || ""),
      undefined,
      { sensitivity: "base", numeric: true },
    ),
  );
}

/**
 * Returns unique first-letter groups for a sorted list.
 * @param {Array<any>} items - Items to group.
 * @param {Function} getName - Name selector.
 */
function alphaLetters(items, getName) {
  return [
    ...new Set(
      alphaSortItems(items, getName).map((item) => firstLetter(getName(item))),
    ),
  ];
}
