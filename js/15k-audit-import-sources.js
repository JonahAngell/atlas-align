/**
 * 15k-audit-import-sources.js
 * Reviews the sources named by an audit JSON import before it is saved. Each
 * source missing from the Source Library is created as a custom source, mapped
 * onto an existing library source field by field, or kept as written. The
 * file may carry `customSources` and `sourceMappings` hints that prefill those
 * choices. Mapping reuses the Replace Source rewrite in 15i-source-replace.js,
 * so unmatched fields are reported the same way.
 */
let atlasImportSourceReviewState = null;

const ATLAS_IMPORT_HINT_KEYS = ["customSources", "sourceMappings"];
const ATLAS_IMPORT_CALCULATED_SOURCE = "calculated field";
const ATLAS_IMPORT_FIELD_FORMATS = [
  "Text",
  "Number",
  "Decimal",
  "Date",
  "Date/Time",
  "Boolean",
  "Currency",
];
// Mirrors NAME_PATTERN in src/custom-source.js so problems surface before POST.
const ATLAS_IMPORT_NAME_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} .,&'’_:/()+-]*$/u;
const ATLAS_IMPORT_MAX_FIELDS = 200;

function atlasImportFold(value) {
  return String(value || "").trim().toLowerCase();
}

function atlasImportList(value) {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === "object") : [];
}

/**
 * Reads source hints from the file root and from each audit, then removes
 * them so they are not stored on the audit documents.
 */
function atlasImportExtractHints(json, documents) {
  const hints = { customSources: [], sourceMappings: [] };
  const holders = [];
  if (json && typeof json === "object" && !Array.isArray(json)) holders.push(json);
  (documents || []).forEach((document) => {
    if (document && !holders.includes(document)) holders.push(document);
  });
  holders.forEach((holder) => {
    ATLAS_IMPORT_HINT_KEYS.forEach((key) => {
      hints[key].push(...atlasImportList(holder[key]));
    });
  });
  (documents || []).forEach((document) => {
    ATLAS_IMPORT_HINT_KEYS.forEach((key) => delete document?.[key]);
  });
  return hints;
}

function atlasImportSourceIdentity(source) {
  const sourceKey = String(source?.sourceKey || "").trim();
  const name = String(source?.name || "").trim();
  const sourceFile = String(source?.sourceFile || name || sourceKey).trim();
  const alias = String(source?.alias || "").trim();
  const identity = atlasNormalizeReplacementIdentity({
    sourceKey: sourceKey || name || sourceFile || alias,
    sourceFile,
    alias: alias || sourceFile,
    name,
  });
  return identity;
}

function atlasImportIdentityMatches(value, identity) {
  return atlasReplacementSourceMatches(value, identity);
}

function atlasImportIsCalculated(identity) {
  return identity.tokens.some(
    (token) => atlasImportFold(token) === ATLAS_IMPORT_CALCULATED_SOURCE,
  );
}

/**
 * Groups the sources named across every imported audit. A source named the
 * same way in two audits is reviewed once.
 */
function atlasImportCollectSources(documents) {
  const entries = [];
  (documents || []).forEach((document, documentIndex) => {
    (document?.sources || []).forEach((source) => {
      const identity = atlasImportSourceIdentity(source);
      if (!identity.sourceKey || atlasImportIsCalculated(identity)) return;
      let entry = entries.find((item) =>
        identity.tokens.some((token) => atlasImportIdentityMatches(token, item.identity)),
      );
      if (!entry) {
        entry = {
          id: `import-source-${entries.length + 1}`,
          identity,
          label: identity.sourceFile || identity.sourceKey,
          alias: identity.alias,
          description: String(source?.description || "").trim(),
          documentIndexes: [],
          fields: [],
        };
        entries.push(entry);
      }
      if (!entry.documentIndexes.includes(documentIndex))
        entry.documentIndexes.push(documentIndex);
      atlasImportFieldsForSource(document, entry.identity).forEach((field) => {
        const existing = entry.fields.find((item) => item.field === field.field);
        if (!existing) entry.fields.push(field);
        else {
          existing.vanity = existing.vanity || field.vanity;
          existing.description = existing.description || field.description;
          existing.fieldFormat = existing.fieldFormat || field.fieldFormat;
        }
      });
    });
  });
  return entries;
}

/** Fields an audit declares for a source, plus fields only its logic uses. */
function atlasImportFieldsForSource(document, identity) {
  const fields = [];
  const add = (field, details = {}) => {
    const name = String(field || "").trim();
    if (!name || fields.some((item) => item.field === name)) return;
    fields.push({
      field: name,
      vanity: String(details.vanity || "").trim(),
      description: String(details.description || "").trim(),
      fieldFormat: String(details.fieldFormat || "").trim(),
    });
  };
  (document?.fields || []).forEach((field) => {
    if (String(field?.type || "") === "Custom") return;
    const sourceMatches = [field?.sourceKey, field?.sourceFile, field?.sourceAlias].some(
      (value) => atlasImportIdentityMatches(value, identity),
    );
    if (!sourceMatches) return;
    const raw = field.rawFieldName || field.fieldName || field.name;
    add(raw, {
      vanity: field.vanityLabel || (field.name !== raw ? field.name : ""),
      description: field.businessDescription || field.description,
      fieldFormat: field.fieldFormat,
    });
  });
  atlasCollectSourceReplacementRows(document, identity).forEach((row) => add(row.field));
  return fields;
}

function atlasImportLibraryIdentity(source) {
  return atlasNormalizeReplacementIdentity({
    sourceKey: source?.sourceKey,
    sourceFile: source?.sourceFile,
    alias: source?.alias,
  });
}

/**
 * Finds the library source an imported source names. `key` means the import
 * already uses the library key, so nothing needs to change; `name` means it
 * matched on file name or alias and its references should be rewritten.
 */
function atlasImportFindLibrarySource(identity, librarySources) {
  const library = Array.isArray(librarySources) ? librarySources : [];
  const byKey = library.filter((source) =>
    [identity.sourceKey, identity.alias].some(
      (token) => token && atlasImportFold(token) === atlasImportFold(source.sourceKey),
    ),
  );
  if (byKey.length === 1) return { source: byKey[0], match: "key" };
  if (byKey.length > 1) return null;
  const byName = library.filter((source) =>
    identity.tokens.some((token) =>
      atlasImportLibraryIdentity(source).tokens.some(
        (item) => atlasImportFold(item) === atlasImportFold(token),
      ),
    ),
  );
  return byName.length === 1 ? { source: byName[0], match: "name" } : null;
}

function atlasImportFindHint(identity, hints) {
  return (
    (hints || []).find((hint) =>
      [hint.source, hint.importedSource, hint.sourceName].some((value) =>
        atlasImportIdentityMatches(value, identity),
      ),
    ) || null
  );
}

function atlasImportFieldFormat(value) {
  const folded = atlasImportFold(value);
  return (
    ATLAS_IMPORT_FIELD_FORMATS.find((format) => atlasImportFold(format) === folded) ||
    "Text"
  );
}

function atlasImportCreateFields(entry, hint) {
  const hinted = atlasImportList(hint?.fields).map((field) => {
    const fieldName = String(field.fieldName || field.field || field.name || "").trim();
    return {
      fieldName,
      vanityLabel: String(field.vanityLabel || field.displayName || fieldName).trim(),
      fieldFormat: atlasImportFieldFormat(field.fieldFormat),
      businessDescription: String(field.businessDescription || field.description || "").trim(),
    };
  });
  const fields = hinted.filter((field) => field.fieldName);
  entry.fields.forEach((field) => {
    if (fields.some((item) => item.fieldName === field.field)) return;
    fields.push({
      fieldName: field.field,
      vanityLabel: field.vanity || field.field,
      fieldFormat: atlasImportFieldFormat(field.fieldFormat),
      businessDescription: field.description,
    });
  });
  return fields;
}

function atlasImportCandidates(source) {
  if (!source) return [];
  const identity = atlasImportLibraryIdentity(source);
  return (source.fields || [])
    .map((field) => atlasReplacementCandidateFromField(field, identity))
    .filter((candidate) => candidate.field);
}

/**
 * Builds one mapping row per imported field. Explicit hint mappings win;
 * everything else is auto-matched the way Replace Source matches.
 */
function atlasImportFieldRows(entry, targetSource, explicit = {}) {
  const candidates = atlasImportCandidates(targetSource);
  return entry.fields.map((field) => {
    const wanted = String(explicit?.[field.field] || "").trim();
    let destination = null;
    let manual = false;
    if (wanted) {
      destination =
        candidates.find((candidate) => candidate.field === wanted) ||
        candidates.find((candidate) => atlasImportFold(candidate.field) === atlasImportFold(wanted)) ||
        null;
      manual = Boolean(destination);
    }
    if (!destination)
      destination = atlasAutoMatchSourceReplacement(
        { field: field.field, vanity: field.vanity, matchingKeys: [] },
        candidates,
      );
    return { field: field.field, vanity: field.vanity || field.field, destination, manual };
  });
}

/**
 * Chooses the starting action for every imported source:
 * - `library`: already uses a library key; imported unchanged.
 * - `map`: rewritten onto a library source (matched by name or hinted).
 * - `create`: created as a custom source, then mapped onto it.
 */
function atlasImportInitialPlan(entries, librarySources, hints = {}) {
  return (entries || []).map((entry) => {
    const mappingHint = atlasImportFindHint(entry.identity, hints.sourceMappings);
    const createHint = atlasImportFindHint(entry.identity, hints.customSources);
    const found = atlasImportFindLibrarySource(entry.identity, librarySources);
    const plan = {
      ...entry,
      action: "create",
      inLibrary: found?.match === "key",
      targetSourceKey: "",
      rows: [],
      sourceName: String(createHint?.sourceName || entry.label).trim(),
      sourceSystem: String(createHint?.sourceSystem || "").trim(),
      createFields: atlasImportCreateFields(entry, createHint),
      hinted: Boolean(mappingHint || createHint),
      createdSource: null,
    };
    if (mappingHint) {
      const target = atlasImportFindLibrarySource(
        atlasNormalizeReplacementIdentity(
          String(mappingHint.targetSource || mappingHint.targetSourceKey || "").trim(),
        ),
        librarySources,
      )?.source;
      if (target) {
        plan.action = "map";
        plan.targetSourceKey = target.sourceKey;
        plan.rows = atlasImportFieldRows(entry, target, mappingHint.fields);
        return plan;
      }
      plan.hintWarning = `The mapping target ${mappingHint.targetSource || mappingHint.targetSourceKey || "(blank)"} is not in the Source Library.`;
    }
    // A library match beats a customSources hint, so importing the same file
    // twice reuses the custom source the first import created.
    if (found && createHint)
      plan.hintWarning = `${found.source.sourceFile || found.source.sourceKey} is already in the Source Library, so the file's custom source definition was not used.`;
    if (found?.match === "key") {
      plan.action = "library";
      plan.targetSourceKey = found.source.sourceKey;
      return plan;
    }
    if (found) {
      plan.action = "map";
      plan.targetSourceKey = found.source.sourceKey;
      plan.rows = atlasImportFieldRows(entry, found.source);
    }
    return plan;
  });
}

/** Returns the first problem that would stop the server saving this source. */
function atlasImportCustomSourceProblem(plan) {
  const name = String(plan.sourceName || "").trim();
  if (!name) return `Enter a source name for ${plan.label}.`;
  if (name.length > 200 || !ATLAS_IMPORT_NAME_PATTERN.test(name))
    return `The source name ${name} can use letters, numbers, spaces, and . , & ' - _ ( ) : / + (up to 200 characters).`;
  const system = String(plan.sourceSystem || "").trim();
  if (system && (system.length > 120 || !ATLAS_IMPORT_NAME_PATTERN.test(system)))
    return `The source system for ${name} can use letters, numbers, spaces, and . , & ' - _ ( ) : / + (up to 120 characters).`;
  const fields = plan.createFields || [];
  if (!fields.length)
    return `${name} has no fields. Map it to a library source or keep it as is.`;
  if (fields.length > ATLAS_IMPORT_MAX_FIELDS)
    return `${name} has ${fields.length} fields. A custom source can include at most ${ATLAS_IMPORT_MAX_FIELDS}.`;
  for (const field of fields) {
    if (!ATLAS_IMPORT_NAME_PATTERN.test(field.fieldName) || field.fieldName.length > 200)
      return `The field name ${field.fieldName} in ${name} can use letters, numbers, spaces, and . , & ' - _ ( ) : / +. Rename it in the JSON file, or map this source instead.`;
    if (!String(field.vanityLabel || "").trim())
      return `Enter a display name for ${field.fieldName} in ${name}.`;
    if (!ATLAS_IMPORT_FIELD_FORMATS.includes(field.fieldFormat))
      return `Select a format for ${field.fieldName} in ${name}.`;
  }
  return "";
}

function atlasImportCustomSourcePayload(plan) {
  return {
    sourceName: String(plan.sourceName || "").trim(),
    sourceSystem: String(plan.sourceSystem || "").trim(),
    fields: (plan.createFields || []).map((field) => ({
      fieldName: field.fieldName,
      vanityLabel: String(field.vanityLabel || "").trim(),
      fieldFormat: field.fieldFormat,
      businessDescription: String(field.businessDescription || "").trim(),
    })),
  };
}

const ATLAS_IMPORT_SOURCE_ONLY_KEYS = [
  ["source_file", "source_alias"],
  ["output_source", "output_source_alias"],
  ["union_left_source", "union_left_alias"],
  ["union_right_source", "union_right_alias"],
  ["then_output_source_file", "then_output_source_alias"],
];

/**
 * Rewrites source names that carry no field of their own. Field-bearing
 * references are left to the Replace Source rewrite, so an unmapped field
 * keeps naming the original source and is reported as a gap.
 */
function atlasImportRewriteSourceOnlyReferences(document, identity, target) {
  const matches = (value) => atlasImportIdentityMatches(value, identity);
  (document?.steps || []).forEach((step) => {
    if (!step) return;
    const params = step.params && typeof step.params === "object" ? step.params : (step.params = {});
    if (step.step_type === "reference_source") {
      if (![step.source, step.sourceKey, params.source_file, params.source_alias].some(matches))
        return;
      // Same shape as referenceStepForSource: key on the step, file name in params.
      step.source = target.sourceKey;
      if (step.sourceKey) step.sourceKey = target.sourceKey;
      params.source_file = target.sourceFile;
      params.source_alias = target.alias;
      if (/^Reference /.test(String(step.title || ""))) step.title = `Reference ${target.sourceFile}`;
      return;
    }
    const primaryField = String(step.field || params.field_name || "").trim();
    if (!primaryField) {
      if (matches(step.source)) step.source = target.sourceKey;
      if (matches(step.sourceKey)) step.sourceKey = target.sourceKey;
    }
    ATLAS_IMPORT_SOURCE_ONLY_KEYS.forEach(([sourceKey, aliasKey]) => {
      if (sourceKey === "source_file" && primaryField) return;
      if (!matches(params[sourceKey])) return;
      params[sourceKey] = target.sourceKey;
      if (aliasKey in params || sourceKey === "source_file") params[aliasKey] = target.alias;
    });
  });
}

function atlasImportSourceRecord(previous, target) {
  const identity = atlasImportLibraryIdentity(target);
  return {
    id: previous?.id || `source_${identity.sourceKey}`,
    sourceKey: identity.sourceKey,
    name: identity.sourceKey,
    sourceFile: identity.sourceFile,
    alias: identity.alias || identity.sourceFile,
    color: previous?.color || "",
    description: previous?.description || "",
    sourceMetadata: target.sourceMetadata || {},
  };
}

/**
 * Applies one reviewed source to one audit document: rewrite references,
 * swap the source record, point mapped fields at the library field, and
 * record unmatched fields for the audit issues surface.
 */
function atlasImportApplyMapping(document, plan, target) {
  if (!document || !target) return document;
  const identity = plan.identity;
  const targetIdentity = atlasImportLibraryIdentity(target);
  const used = new Set(atlasImportFieldsForSource(document, identity).map((field) => field.field));
  const rows = (plan.rows || []).filter((row) => used.has(row.field));
  atlasRewriteSourceReplacementReferences(
    document,
    identity,
    rows.map((row) => ({ oldField: row.field, destination: row.destination })),
    [target],
  );
  atlasImportRewriteSourceOnlyReferences(document, identity, targetIdentity);
  const sources = Array.isArray(document.sources) ? document.sources : [];
  const previous = sources.find((source) =>
    atlasImportSourceIdentity(source).tokens.some((token) =>
      atlasImportIdentityMatches(token, identity),
    ),
  );
  const alreadyThere = sources.some(
    (source) => source !== previous && atlasImportFold(source.sourceKey) === atlasImportFold(target.sourceKey),
  );
  document.sources = sources.filter((source) => source !== previous);
  if (!alreadyThere)
    document.sources.splice(
      Math.max(0, sources.indexOf(previous)),
      0,
      atlasImportSourceRecord(previous, target),
    );
  const byField = new Map(rows.filter((row) => row.destination).map((row) => [row.field, row.destination]));
  (document.fields || []).forEach((field) => {
    if (String(field?.type || "") === "Custom") return;
    const sourceMatches = [field.sourceKey, field.sourceFile, field.sourceAlias].some((value) =>
      atlasImportIdentityMatches(value, identity),
    );
    if (!sourceMatches) return;
    const raw = String(field.rawFieldName || field.fieldName || field.name || "").trim();
    const destination = byField.get(raw);
    if (!destination) return;
    field.sourceKey = destination.sourceKey;
    field.sourceFile = destination.sourceFile;
    field.sourceAlias = destination.alias;
    field.rawFieldName = destination.field;
    if ("fieldName" in field) field.fieldName = destination.field;
    if (field.name === raw) field.name = destination.vanity || destination.field;
  });
  document.unmatchedSourceReplacements = atlasBuildSourceReplacementGaps({
    original: identity,
    rows,
    replacementSources: [target],
    existing: document.unmatchedSourceReplacements,
  });
  if (
    !document.unmatchedSourceReplacements.fields.length &&
    !document.unmatchedSourceReplacements.sources.length
  )
    delete document.unmatchedSourceReplacements;
  return document;
}

function atlasImportApplyPlans(documents, plans, librarySources) {
  (plans || []).forEach((plan) => {
    if (plan.action !== "map" && plan.action !== "create") return;
    const targetKey = plan.action === "create" ? plan.createdSource?.sourceKey : plan.targetSourceKey;
    const target = (librarySources || []).find((source) => source.sourceKey === targetKey);
    if (!target) return;
    plan.documentIndexes.forEach((index) => atlasImportApplyMapping(documents[index], plan, target));
  });
  return documents;
}

function atlasImportPlanNeedsReview(plans, hints) {
  return (
    (plans || []).some((plan) => plan.action !== "library") ||
    Boolean(hints?.customSources?.length || hints?.sourceMappings?.length)
  );
}

// -----------------------------------------------------------------------------
// Review dialog
// -----------------------------------------------------------------------------
function atlasImportLibrarySources() {
  return (typeof repoLibraryState !== "undefined" && repoLibraryState?.sourceFiles) || [];
}

function atlasImportLibrarySource(sourceKey) {
  return atlasImportLibrarySources().find((source) => source.sourceKey === sourceKey) || null;
}

function atlasImportLibraryLabel(sourceKey) {
  const source = atlasImportLibrarySource(sourceKey);
  if (!source) return sourceKey;
  return source.alias && source.alias !== source.sourceFile
    ? `${source.sourceFile} (${source.alias})`
    : source.sourceFile || sourceKey;
}

/**
 * Opens the review dialog when any imported source needs a decision.
 * Resolves with the documents to import, or null when the user cancels.
 */
async function atlasReviewImportSources(json, documents, fileName = "") {
  const hints = atlasImportExtractHints(json, documents);
  // Compare against the live library, including custom sources other people
  // just added. Without it every source would look new and be duplicated.
  try {
    await atlasImportReloadLibrary();
  } catch (_error) {
    throw new Error(
      "The Source Library couldn't be loaded, so the file's sources can't be checked. Reload the page and try the import again.",
    );
  }
  const plans = atlasImportInitialPlan(
    atlasImportCollectSources(documents),
    atlasImportLibrarySources(),
    hints,
  );
  if (!atlasImportPlanNeedsReview(plans, hints)) return documents;
  return new Promise((resolve) => {
    atlasImportSourceReviewState = {
      documents,
      plans,
      fileName,
      error: "",
      busy: false,
      restoreFocus: document.activeElement,
      resolve,
    };
    atlasRenderImportSourceReview();
    document.querySelector(".import-source-review-modal")?.focus();
  });
}

function atlasImportSummaryCounts(plans) {
  const count = (action) => plans.filter((plan) => plan.action === action).length;
  return {
    library: count("library"),
    map: count("map"),
    create: count("create"),
    keep: count("keep"),
  };
}

function atlasImportUsedBy(plan, documents) {
  const names = plan.documentIndexes.map((index) => documents[index]?.name || documents[index]?.id || `Audit ${index + 1}`);
  return names.length > 2 ? `${names.slice(0, 2).join(", ")} and ${names.length - 2} more` : names.join(", ");
}

function atlasImportStatusBadge(plan) {
  if (plan.action === "library") return '<span class="badge green">In Source Library</span>';
  if (plan.action === "map") {
    const unmatched = plan.rows.filter((row) => !row.destination).length;
    if (!plan.targetSourceKey) return '<span class="badge amber">Choose a library source</span>';
    return unmatched
      ? `<span class="badge amber">${unmatched} ${unmatched === 1 ? "field" : "fields"} unmatched</span>`
      : '<span class="badge green">All fields mapped</span>';
  }
  if (plan.action === "create")
    return plan.createdSource
      ? '<span class="badge green">Custom source created</span>'
      : '<span class="badge blue">New custom source</span>';
  return '<span class="badge amber">Not in Source Library</span>';
}

function atlasImportActionChoices(plan) {
  const choices = [
    ["create", "Create custom source", "Add it to the shared Source Library with these fields."],
    ["map", "Map to library source", "Point its fields at a source already in the library."],
    ["keep", "Keep as written", "Import unchanged. Audit issues will flag it."],
  ];
  const name = `importSourceAction-${plan.id}`;
  return `<fieldset class="import-source-actions" ${plan.createdSource ? "disabled" : ""}>
    <legend class="visually-hidden">How should ${esc(plan.label)} be handled?</legend>
    ${choices
      .map(
        ([value, label, hint]) => `<label class="import-source-action">
          <input type="radio" name="${esc(name)}" value="${value}" data-import-source-action="${esc(plan.id)}" ${plan.action === value ? "checked" : ""} />
          <span><strong>${label}</strong><span class="hint">${hint}</span></span>
        </label>`,
      )
      .join("")}
  </fieldset>`;
}

function atlasImportCreatePanel(plan) {
  const disabled = plan.createdSource ? "disabled" : "";
  const rows = plan.createFields
    .map(
      (field, index) => `<tr>
        <td><code>${esc(field.fieldName)}</code></td>
        <td><input class="input" aria-label="Display name for ${esc(field.fieldName)}" maxlength="200" value="${esc(field.vanityLabel)}" data-import-create-field="${esc(plan.id)}" data-field-index="${index}" data-field-key="vanityLabel" ${disabled} /></td>
        <td><select aria-label="Format for ${esc(field.fieldName)}" data-import-create-field="${esc(plan.id)}" data-field-index="${index}" data-field-key="fieldFormat" ${disabled}>
          ${ATLAS_IMPORT_FIELD_FORMATS.map((format) => `<option ${format === field.fieldFormat ? "selected" : ""}>${format}</option>`).join("")}
        </select></td>
      </tr>`,
    )
    .join("");
  return `<div class="import-source-panel">
    <div class="import-source-inputs">
      <label><span>Source name</span><input class="input" maxlength="200" value="${esc(plan.sourceName)}" data-import-create-input="${esc(plan.id)}" data-input-key="sourceName" ${disabled} /></label>
      <label><span>Source system <span class="hint">Optional</span></span><input class="input" maxlength="120" value="${esc(plan.sourceSystem)}" data-import-create-input="${esc(plan.id)}" data-input-key="sourceSystem" ${disabled} /></label>
    </div>
    <div class="tablewrap import-source-table-wrap">
      <table class="import-source-table">
        <thead><tr><th>Source field name</th><th>Display name</th><th>Format</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="3"><p class="hint">No fields were found for this source in the file. Map it to a library source, or keep it as written.</p></td></tr>'}</tbody>
      </table>
    </div>
  </div>`;
}

function atlasImportMapPanel(plan) {
  const target = plan.targetSourceKey ? atlasImportLibraryLabel(plan.targetSourceKey) : "Choose a library source";
  const rows = plan.rows
    .map((row) => {
      const destination = row.destination
        ? row.destination.vanity && row.destination.vanity !== row.destination.field
          ? `${row.destination.vanity} (${row.destination.field})`
          : row.destination.field
        : "Leave unmatched";
      const label = row.vanity && row.vanity !== row.field ? `${row.vanity} (${row.field})` : row.field;
      return `<tr>
        <td><strong>${esc(label)}</strong></td>
        <td><button type="button" class="visual-picker-trigger-button source-replace-popup-trigger" data-import-field-picker="${esc(plan.id)}" data-import-field="${esc(row.field)}" aria-label="Library field for ${esc(row.field)}: ${esc(destination)}">
          <span class="visual-picker-trigger-main"><strong>${esc(destination)}</strong></span>
          <span class="visual-picker-trigger-caret" aria-hidden="true">⌄</span>
        </button></td>
        <td>${row.destination ? "Mapped" : "Unmatched"}</td>
      </tr>`;
    })
    .join("");
  return `<div class="import-source-panel">
    <div class="source-replace-popup-row">
      <span class="import-source-label">Library source</span>
      <button type="button" class="visual-picker-trigger-button source-replace-popup-trigger" data-import-source-picker="${esc(plan.id)}" aria-label="Library source for ${esc(plan.label)}: ${esc(target)}">
        <span class="visual-picker-trigger-main"><strong>${esc(target)}</strong></span>
        <span class="visual-picker-trigger-caret" aria-hidden="true">⌄</span>
      </button>
    </div>
    ${
      plan.targetSourceKey
        ? `<div class="tablewrap import-source-table-wrap">
      <table class="source-replace-mapping-table">
        <thead><tr><th>Imported field</th><th>Library field</th><th>Status</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="3"><p class="hint">No fields from this source are used. Only the source reference changes.</p></td></tr>'}</tbody>
      </table>
    </div>
    <p class="hint">Unmatched fields keep their imported names and are reported as critical audit issues, where Replace Source can finish the mapping.</p>`
        : ""
    }
  </div>`;
}

function atlasImportSourceCard(plan, documents) {
  const fieldCount = plan.fields.length;
  const meta = [
    plan.alias && plan.alias !== plan.label ? `Alias ${plan.alias}` : "",
    `Used by ${atlasImportUsedBy(plan, documents)}`,
    `${fieldCount} ${fieldCount === 1 ? "field" : "fields"}`,
  ].filter(Boolean);
  const panel =
    plan.action === "create"
      ? atlasImportCreatePanel(plan)
      : plan.action === "map"
        ? atlasImportMapPanel(plan)
        : '<p class="hint import-source-panel">References stay as written. Use Replace Source after import to connect this source to the library.</p>';
  return `<section class="import-source-card" aria-labelledby="${esc(plan.id)}-title" data-import-source-card="${esc(plan.id)}">
    <div class="import-source-card-header">
      <div>
        <h3 id="${esc(plan.id)}-title">${esc(plan.label)}</h3>
        <p class="hint">${esc(meta.join(" · "))}</p>
        ${plan.hinted ? '<p class="hint">Prefilled from the import file.</p>' : ""}
        ${plan.hintWarning ? `<p class="import-source-warning" role="note"><span data-atlas-icon="warning" aria-hidden="true"></span>${esc(plan.hintWarning)}</p>` : ""}
      </div>
      ${atlasImportStatusBadge(plan)}
    </div>
    ${atlasImportActionChoices(plan)}
    ${panel}
  </section>`;
}

function atlasRenderImportSourceReview() {
  const session = atlasImportSourceReviewState;
  const existing = document.querySelector(".import-source-review-backdrop");
  const focusKey = existing?.contains(document.activeElement)
    ? atlasImportFocusKey(document.activeElement)
    : "";
  const scrollTop = existing?.querySelector(".import-source-review-body")?.scrollTop || 0;
  existing?.remove();
  if (!session) return;
  const { plans, documents } = session;
  const review = plans.filter((plan) => plan.action !== "library" || plan.hinted);
  const inLibrary = plans.filter((plan) => plan.action === "library" && !plan.hinted);
  const counts = atlasImportSummaryCounts(plans);
  const auditCount = documents.length;
  const summary = [
    counts.create ? `${counts.create} to create` : "",
    counts.map ? `${counts.map} to map` : "",
    counts.keep ? `${counts.keep} kept as written` : "",
    counts.library ? `${counts.library} already in the library` : "",
  ].filter(Boolean);
  const root = document.createElement("div");
  root.className = "import-source-review-backdrop";
  root.innerHTML = `<div class="source-replace-modal import-source-review-modal" role="dialog" aria-modal="true" aria-labelledby="importSourceReviewTitle" aria-describedby="importSourceReviewDescription" tabindex="-1" ${session.busy ? 'aria-busy="true"' : ""}>
    <div class="source-replace-header">
      <div>
        <h2 id="importSourceReviewTitle">Review Import Sources</h2>
        <p class="hint" id="importSourceReviewDescription">${esc(session.fileName || "This file")} has ${auditCount} ${auditCount === 1 ? "audit" : "audits"} using ${plans.length} ${plans.length === 1 ? "source" : "sources"}. Choose how to handle each source that isn't in the Source Library. Custom sources are saved for everyone, with your name on them.</p>
        <p class="import-source-summary">${esc(summary.join(" · "))}</p>
      </div>
      <button type="button" class="visual-picker-close-button" data-import-source-cancel aria-label="Cancel import">×</button>
    </div>
    <div class="import-source-review-body">
      ${review.map((plan) => atlasImportSourceCard(plan, documents)).join("")}
      ${
        inLibrary.length
          ? `<details class="import-source-library-list">
        <summary>Already in the Source Library (${inLibrary.length})</summary>
        <ul>${inLibrary.map((plan) => `<li>${esc(plan.label)} <span class="hint">${esc(atlasImportLibraryLabel(plan.targetSourceKey))}</span></li>`).join("")}</ul>
      </details>`
          : ""
      }
    </div>
    <p class="import-source-error" role="alert" ${session.error ? "" : "hidden"}><span data-atlas-icon="warning" aria-hidden="true"></span>${esc(session.error)}</p>
    <div class="source-replace-actions">
      <button type="button" class="btn secondary small" data-import-source-cancel ${session.busy ? "disabled" : ""}>Cancel Import</button>
      <button type="button" class="btn primary small" data-import-source-confirm ${session.busy ? "disabled" : ""}>${session.busy ? "Importing…" : `Import ${auditCount} ${auditCount === 1 ? "Audit" : "Audits"}`}</button>
    </div>
  </div>`;
  document.body.append(root);
  window.atlasMountIcons?.(root);
  const body = root.querySelector(".import-source-review-body");
  if (body) body.scrollTop = scrollTop;
  if (focusKey) root.querySelector(focusKey)?.focus();
}

/** Selector that finds the same control after the dialog re-renders. */
function atlasImportFocusKey(element) {
  const attributes = [
    "data-import-source-action",
    "data-import-source-picker",
    "data-import-field-picker",
    "data-import-create-input",
    "data-import-create-field",
  ];
  const attribute = attributes.find((name) => element?.hasAttribute?.(name));
  if (!attribute) return "";
  let selector = `[${attribute}="${CSS.escape(element.getAttribute(attribute))}"]`;
  ["value", "data-import-field", "data-field-index", "data-field-key", "data-input-key"].forEach((name) => {
    if (element.hasAttribute(name) && (name !== "value" || element.type === "radio"))
      selector += `[${name}="${CSS.escape(element.getAttribute(name))}"]`;
  });
  return selector;
}

function atlasImportPlan(id) {
  return atlasImportSourceReviewState?.plans.find((plan) => plan.id === id) || null;
}

function atlasCloseImportSourceReview(result) {
  const session = atlasImportSourceReviewState;
  if (!session) return;
  atlasImportSourceReviewState = null;
  document.querySelector(".import-source-review-backdrop")?.remove();
  const picker = document.getElementById("atlas-visual-picker-root");
  if (picker) picker.style.zIndex = "";
  session.restoreFocus?.focus?.();
  session.resolve(result);
}

function atlasImportSetAction(plan, action) {
  if (!plan || plan.createdSource) return;
  plan.action = action;
  if (action === "map" && plan.targetSourceKey && !plan.rows.length)
    plan.rows = atlasImportFieldRows(plan, atlasImportLibrarySource(plan.targetSourceKey));
  atlasImportSourceReviewState.error = "";
  atlasRenderImportSourceReview();
}

function atlasImportPickerColor() {
  return "#667085";
}

function atlasOpenImportSourcePicker(plan) {
  if (!plan || typeof ATLASVisualPicker?.open !== "function") return;
  atlasRaiseReplacementPicker();
  ATLASVisualPicker.open({
    mode: "source",
    title: "Library source",
    guidance: `Choose the Source Library source that ${plan.label} should use.`,
    searchPlaceholder: "Search library sources...",
    entries: atlasImportLibrarySources().map((source) => ({
      key: source.sourceKey,
      label: atlasImportLibraryLabel(source.sourceKey),
      rawName: source.sourceFile,
      sourceKey: source.sourceKey,
      sourceLabel: source.alias || source.sourceFile,
      sourceColor: atlasImportPickerColor(),
    })),
    selectedKey: plan.targetSourceKey || null,
    closeOnSelect: true,
    onSelect(entry) {
      const sourceKey = entry?.sourceKey || entry?.key || "";
      if (!sourceKey) return;
      plan.targetSourceKey = sourceKey;
      plan.rows = atlasImportFieldRows(plan, atlasImportLibrarySource(sourceKey));
      atlasRenderImportSourceReview();
    },
    onClose() {
      const picker = document.getElementById("atlas-visual-picker-root");
      if (picker) picker.style.zIndex = "";
    },
  });
}

function atlasOpenImportFieldPicker(plan, fieldName) {
  if (!plan || typeof ATLASVisualPicker?.open !== "function") return;
  const row = plan.rows.find((item) => item.field === fieldName);
  if (!row) return;
  const entries = [
    {
      key: "__unmatched__",
      label: "Leave unmatched",
      rawName: "",
      sourceKey: "",
      sourceLabel: "Unmatched",
      sourceColor: atlasImportPickerColor(),
      destination: null,
    },
    ...atlasImportCandidates(atlasImportLibrarySource(plan.targetSourceKey)).map((candidate, index) => ({
      key: `${candidate.sourceKey}::${candidate.field}::${index}`,
      label: candidate.label,
      rawName: candidate.field,
      sourceKey: candidate.sourceKey,
      sourceLabel: candidate.alias || candidate.sourceFile,
      sourceColor: atlasImportPickerColor(),
      destination: candidate,
    })),
  ];
  atlasRaiseReplacementPicker();
  ATLASVisualPicker.open({
    mode: "field",
    title: "Library field",
    guidance: `Choose the library field for ${row.vanity || row.field}, or leave it unmatched.`,
    searchPlaceholder: "Search library fields...",
    entries,
    selectedKey: row.destination
      ? entries.find((entry) => entry.destination?.field === row.destination.field)?.key
      : "__unmatched__",
    closeOnSelect: true,
    onSelect(entry) {
      row.destination = entry?.destination || null;
      row.manual = true;
      atlasRenderImportSourceReview();
    },
    onClose() {
      const picker = document.getElementById("atlas-visual-picker-root");
      if (picker) picker.style.zIndex = "";
    },
  });
}

async function atlasImportReloadLibrary() {
  await loadSourceFileLibrary({});
  repoLibraryState.sourceFileCache?.clear();
  atlasInvalidateSourceDerivedState?.();
  refreshFieldPickerOptions?.();
  renderSourceFieldBrowser?.();
  renderFieldPickerPanel?.();
}

async function atlasConfirmImportSourceReview() {
  const session = atlasImportSourceReviewState;
  if (!session || session.busy) return;
  const pendingMap = session.plans.find((plan) => plan.action === "map" && !plan.targetSourceKey);
  if (pendingMap) {
    session.error = `Choose a library source for ${pendingMap.label}, or pick another option.`;
    return atlasRenderImportSourceReview();
  }
  const toCreate = session.plans.filter((plan) => plan.action === "create" && !plan.createdSource);
  for (const plan of toCreate) {
    const problem = atlasImportCustomSourceProblem(plan);
    if (problem) {
      session.error = problem;
      return atlasRenderImportSourceReview();
    }
  }
  session.busy = true;
  session.error = "";
  atlasRenderImportSourceReview();
  try {
    for (const plan of toCreate) {
      plan.createdSource = await atlasApiJson("/api/source-library/custom", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(atlasImportCustomSourcePayload(plan)),
      });
      plan.rows = atlasImportFieldRows(plan, plan.createdSource, Object.fromEntries(
        plan.createFields.map((field) => [field.fieldName, field.fieldName]),
      ));
    }
    if (toCreate.length) await atlasImportReloadLibrary();
    const library = [
      ...atlasImportLibrarySources(),
      ...session.plans.map((plan) => plan.createdSource).filter(Boolean),
    ];
    atlasImportApplyPlans(session.documents, session.plans, library);
  } catch (error) {
    session.busy = false;
    const created = session.plans.filter((plan) => plan.createdSource).length;
    session.error = `${error?.message || "A custom source could not be saved."}${created ? ` ${created} custom ${created === 1 ? "source was" : "sources were"} already created and will be reused when you try again.` : ""}`;
    if (created) await atlasImportReloadLibrary().catch(() => {});
    return atlasRenderImportSourceReview();
  }
  atlasCloseImportSourceReview(session.documents);
}

if (typeof document !== "undefined" && document.addEventListener) {
  document.addEventListener(
    "click",
    (event) => {
      if (!atlasImportSourceReviewState) return;
      const target = event.target;
      const handled = (fn) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        fn();
      };
      if (target.closest?.("[data-import-source-cancel]"))
        return handled(() => !atlasImportSourceReviewState.busy && atlasCloseImportSourceReview(null));
      if (target.closest?.("[data-import-source-confirm]"))
        return handled(() => atlasConfirmImportSourceReview());
      const sourcePicker = target.closest?.("[data-import-source-picker]");
      if (sourcePicker)
        return handled(() => atlasOpenImportSourcePicker(atlasImportPlan(sourcePicker.dataset.importSourcePicker)));
      const fieldPicker = target.closest?.("[data-import-field-picker]");
      if (fieldPicker)
        return handled(() =>
          atlasOpenImportFieldPicker(
            atlasImportPlan(fieldPicker.dataset.importFieldPicker),
            fieldPicker.dataset.importField || "",
          ),
        );
    },
    true,
  );
  document.addEventListener("change", (event) => {
    const radio = event.target.closest?.("[data-import-source-action]");
    if (radio) atlasImportSetAction(atlasImportPlan(radio.dataset.importSourceAction), radio.value);
  });
  document.addEventListener("input", (event) => {
    const target = event.target;
    const input = target.closest?.("[data-import-create-input]");
    if (input) {
      const plan = atlasImportPlan(input.dataset.importCreateInput);
      if (plan) plan[input.dataset.inputKey] = input.value;
      return;
    }
    const field = target.closest?.("[data-import-create-field]");
    if (field) {
      const plan = atlasImportPlan(field.dataset.importCreateField);
      const record = plan?.createFields[Number(field.dataset.fieldIndex)];
      if (record) record[field.dataset.fieldKey] = field.value;
    }
  });
  document.addEventListener(
    "keydown",
    (event) => {
      const modal = document.querySelector(".import-source-review-modal");
      if (!modal || event.defaultPrevented) return;
      if (typeof ATLASVisualPicker?.isOpen === "function" && ATLASVisualPicker.isOpen()) return;
      if (event.key === "Tab" && typeof atlasTrapTabKey === "function")
        return atlasTrapTabKey(event, modal);
      if (event.key !== "Escape" || atlasImportSourceReviewState?.busy) return;
      event.preventDefault();
      atlasCloseImportSourceReview(null);
    },
    true,
  );
}
