/**
 * 15i-source-replace.js
 * Replace one selected source with one or more sources and map each used field
 * to a single replacement field. Unmatched fields and unused replacement
 * sources are stored on the audit for the readiness and issues surfaces.
 */
let atlasSourceReplaceState = null;

function atlasReplacementMatchingKeys(value) {
  const list = Array.isArray(value) ? value : String(value || "").split(",");
  return [
    ...new Set(
      list
        .map((item) => String(item || "").trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
}

function atlasNormalizeReplacementIdentity(sourceLike) {
  const source =
    typeof sourceLike === "string"
      ? { sourceKey: sourceLike, sourceFile: sourceLike }
      : sourceLike || {};
  const sourceKey = String(
    source.sourceKey || source.name || source.sourceFile || "",
  ).trim();
  const sourceFile = String(
    source.sourceFile || source.name || sourceKey,
  ).trim();
  const alias = String(source.alias || sourceFile).trim();
  const name = String(source.name || "").trim();
  const tokens = [
    ...new Set([sourceKey, sourceFile, alias, name].filter(Boolean)),
  ];
  return { sourceKey, sourceFile, alias, name, tokens };
}

function atlasReplacementSourceMatches(value, identity) {
  const token = String(value || "").trim();
  if (!token || !identity?.tokens?.length) return false;
  if (identity.tokens.includes(token)) return true;
  const folded = token.toLowerCase();
  return identity.tokens.some((item) => item.toLowerCase() === folded);
}

function atlasReplacementCandidateFromField(field, identity) {
  const raw = String(
    field?.rawFieldName || field?.fieldName || field?.name || field?.label || "",
  ).trim();
  const vanity = String(
    field?.vanityLabel || field?.label || field?.name || raw,
  ).trim();
  return {
    sourceKey: identity.sourceKey,
    sourceFile: identity.sourceFile,
    alias: identity.alias || identity.sourceFile,
    field: raw,
    vanity,
    matchingKeys: atlasReplacementMatchingKeys(field?.matchingKeys),
    label: vanity && vanity !== raw ? `${vanity} (${raw})` : raw,
  };
}

function atlasAutoMatchSourceReplacement(oldField, candidates) {
  const list = Array.isArray(candidates) ? candidates.filter(Boolean) : [];
  const raw = String(oldField?.field || oldField?.raw || "").trim();
  const vanity = String(oldField?.vanity || "").trim();
  const keys = new Set(atlasReplacementMatchingKeys(oldField?.matchingKeys));
  const unique = (matches) => (matches.length === 1 ? matches[0] : null);
  const folded = (value) => String(value || "").trim().toLowerCase();
  if (raw) {
    const exact = list.filter((candidate) => candidate.field === raw);
    if (exact.length) return unique(exact);
    const rawFolded = folded(raw);
    const vanityFolded = folded(vanity);
    const insensitive = list.filter((candidate) => {
      const candidateRaw = folded(candidate.field);
      const candidateVanity = folded(candidate.vanity);
      return (
        candidateRaw === rawFolded ||
        (vanityFolded && candidateVanity === vanityFolded) ||
        (vanityFolded && candidateRaw === vanityFolded) ||
        (candidateVanity && candidateVanity === rawFolded)
      );
    });
    if (insensitive.length) return unique(insensitive);
  } else if (vanity) {
    const vanityFolded = folded(vanity);
    const insensitive = list.filter((candidate) => {
      const candidateRaw = folded(candidate.field);
      const candidateVanity = folded(candidate.vanity);
      return (
        candidateVanity === vanityFolded || candidateRaw === vanityFolded
      );
    });
    if (insensitive.length) return unique(insensitive);
  }
  if (!keys.size) return null;
  const keyed = list.filter((candidate) =>
    atlasReplacementMatchingKeys(candidate.matchingKeys).some((key) =>
      keys.has(key),
    ),
  );
  return unique(keyed);
}

function atlasReplacementConditions(step) {
  const params = step?.params || {};
  if (params.conditions_json) {
    try {
      const parsed = JSON.parse(params.conditions_json);
      if (Array.isArray(parsed)) return parsed;
    } catch (_error) {
      return [];
    }
  }
  return Array.isArray(step?.conditions) ? step.conditions : [];
}

function atlasReplacementMathOps(value) {
  if (Array.isArray(value)) return value;
  if (!String(value || "").trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
}

function atlasStepReplacementPairs(step) {
  const params =
    step.params && typeof step.params === "object" ? step.params : {};
  const source = step.source || params.source_file || "";
  const primaryField = step.field || params.field_name || "";
  const pairs = [];
  const add = (sourceValue, fieldValue, write) => {
    const field = String(fieldValue || "").trim();
    const sourceName = String(sourceValue || "").trim();
    if (!sourceName || !field) return;
    pairs.push({ source: sourceName, field, write });
  };
  add(source, primaryField, (dest) => {
    const target =
      step.params && typeof step.params === "object"
        ? step.params
        : (step.params = {});
    step.source = dest.sourceKey;
    step.sourceKey = dest.sourceKey;
    step.sourceFile = dest.sourceFile;
    step.sourceAlias = dest.alias;
    step.field = dest.field;
    target.source_file = dest.sourceKey;
    target.source_key = dest.sourceKey;
    target.source_alias = dest.alias;
    target.field_name = dest.field;
  });
  add(source, params.expression_source_field, (dest) => {
    const target =
      step.params && typeof step.params === "object"
        ? step.params
        : (step.params = {});
    target.expression_source_field = dest.field;
    if (!primaryField) {
      step.source = dest.sourceKey;
      step.sourceKey = dest.sourceKey;
      step.sourceFile = dest.sourceFile;
      step.sourceAlias = dest.alias;
      target.source_file = dest.sourceKey;
      target.source_key = dest.sourceKey;
      target.source_alias = dest.alias;
    }
  });
  add(params.left_source, params.left_field, (dest) => {
    const target = step.params;
    target.left_source = dest.sourceKey;
    target.left_alias = dest.alias;
    target.left_field = dest.field;
  });
  add(params.right_source, params.right_field, (dest) => {
    const target = step.params;
    target.right_source = dest.sourceKey;
    target.right_alias = dest.alias;
    target.right_field = dest.field;
  });
  add(params.concat_source_1 || source, params.concat_field_1, (dest) => {
    const target =
      step.params && typeof step.params === "object"
        ? step.params
        : (step.params = {});
    target.concat_source_1 = dest.sourceKey;
    target.concat_field_1 = dest.field;
  });
  add(params.concat_source_2 || source, params.concat_field_2, (dest) => {
    const target =
      step.params && typeof step.params === "object"
        ? step.params
        : (step.params = {});
    target.concat_source_2 = dest.sourceKey;
    target.concat_field_2 = dest.field;
  });
  add(
    params.then_value_source_file || source,
    params.then_value_field,
    (dest) => {
      const target =
        step.params && typeof step.params === "object"
          ? step.params
          : (step.params = {});
      target.then_value_source_file = dest.sourceKey;
      target.then_value_field = dest.field;
    },
  );
  add(params.string_source_file || source, params.string_source_field, (dest) => {
    const target =
      step.params && typeof step.params === "object"
        ? step.params
        : (step.params = {});
    target.string_source_file = dest.sourceKey;
    target.string_source_alias = dest.alias;
    target.string_source_field = dest.field;
  });
  add(
    params.then_string_source_file || params.then_value_source_file || source,
    params.then_string_source_field,
    (dest) => {
      const target =
        step.params && typeof step.params === "object"
          ? step.params
          : (step.params = {});
      target.then_string_source_file = dest.sourceKey;
      target.then_string_source_alias = dest.alias;
      target.then_string_source_field = dest.field;
    },
  );
  return pairs;
}

function atlasCollectSourceReplacementRows(audit, oldSource, metadata = {}) {
  const identity = atlasNormalizeReplacementIdentity(oldSource);
  const fields = [];
  const add = (source, field) => {
    const name = String(field || "").trim();
    if (!name || !atlasReplacementSourceMatches(source, identity)) return;
    if (fields.includes(name)) return;
    fields.push(name);
  };
  (audit?.steps || []).forEach((step) => {
    if (!step || step.autoGeneratedReference) return;
    atlasStepReplacementPairs(step).forEach((pair) => add(pair.source, pair.field));
    atlasReplacementConditions(step).forEach((condition) => {
      add(condition.sourceFile, condition.fieldName || condition.field);
      add(condition.compareSourceFile, condition.compareFieldName);
      atlasReplacementMathOps(condition.compareMathJson).forEach((operation) => {
        add(
          operation.operandSourceFile || operation.operand_source_file,
          operation.operandFieldName || operation.operand_field_name,
        );
      });
    });
    const params = step.params || {};
    ["source_math_json", "then_math_json"].forEach((key) => {
      atlasReplacementMathOps(params[key]).forEach((operation) => {
        add(
          operation.operandSourceFile || operation.operand_source_file,
          operation.operandFieldName || operation.operand_field_name,
        );
      });
    });
  });
  (audit?.displayFields || []).forEach((field) => {
    add(
      field.sourceKey || field.sourceFile || field.uniqueId,
      field.fieldName || field.rawFieldName || field.fieldTitle || field.name,
    );
  });
  return fields.map((field) => ({
    field,
    vanity: metadata[field]?.vanity || field,
    matchingKeys: atlasReplacementMatchingKeys(metadata[field]?.matchingKeys),
    destination: null,
    manual: false,
  }));
}

function atlasRewriteMathReplacement(value, identity, destinationFor) {
  const operations = atlasReplacementMathOps(value);
  if (!operations.length) return value;
  let changed = false;
  const next = operations.map((operation) => {
    const source = operation.operandSourceFile || operation.operand_source_file;
    const field = operation.operandFieldName || operation.operand_field_name;
    if (!atlasReplacementSourceMatches(source, identity)) return operation;
    const destination = destinationFor(field);
    if (!destination) return operation;
    changed = true;
    return {
      ...operation,
      operandSourceFile: destination.sourceKey,
      operandSourceAlias: destination.alias,
      operandFieldName: destination.field,
    };
  });
  if (!changed) return value;
  return typeof value === "string" ? JSON.stringify(next) : next;
}

function atlasRewriteDisplayFieldReplacement(field, identity, destinationFor) {
  const source = field?.sourceKey || field?.sourceFile || field?.uniqueId;
  const name =
    field?.fieldName || field?.rawFieldName || field?.fieldTitle || field?.name;
  if (!atlasReplacementSourceMatches(source, identity)) return false;
  const destination = destinationFor(name);
  if (!destination) return false;
  field.sourceKey = destination.sourceKey;
  field.sourceFile = destination.sourceFile;
  if ("uniqueId" in field) field.uniqueId = destination.sourceKey;
  field.fieldName = destination.field;
  if ("rawFieldName" in field) field.rawFieldName = destination.field;
  if ("fieldTitle" in field) field.fieldTitle = destination.field;
  if (field.name === name) field.name = destination.field;
  return true;
}

function atlasRewriteSourceReplacementReferences(
  audit,
  oldSource,
  mappings,
  replacementSources = [],
) {
  const identity = atlasNormalizeReplacementIdentity(oldSource);
  const byField = new Map();
  (mappings || []).forEach((mapping) => {
    const field = String(mapping?.oldField || mapping?.field || "").trim();
    if (field && mapping?.destination) byField.set(field, mapping.destination);
  });
  const destinationFor = (field) => byField.get(String(field || "").trim()) || null;
  (audit?.steps || []).forEach((step) => {
    if (!step || step.autoGeneratedReference) return;
    const params =
      step.params && typeof step.params === "object"
        ? step.params
        : (step.params = {});
    atlasStepReplacementPairs(step).forEach((pair) => {
      if (!atlasReplacementSourceMatches(pair.source, identity)) return;
      const destination = destinationFor(pair.field);
      if (!destination) return;
      pair.write(destination);
    });
    if (replacementSources.length === 1) {
      const only = atlasNormalizeReplacementIdentity(replacementSources[0]);
      ["union_left_source", "union_right_source", "output_source"].forEach(
        (key) => {
          if (atlasReplacementSourceMatches(params[key], identity))
            params[key] = only.sourceKey;
        },
      );
    }
    let conditionsChanged = false;
    const conditions = atlasReplacementConditions(step).map((condition) => {
      const next = { ...condition };
      if (atlasReplacementSourceMatches(next.sourceFile, identity)) {
        const destination = destinationFor(next.fieldName || next.field);
        if (destination) {
          next.sourceFile = destination.sourceKey;
          next.sourceAlias = destination.alias;
          next.fieldName = destination.field;
          if ("field" in next) next.field = destination.field;
          conditionsChanged = true;
        }
      }
      if (atlasReplacementSourceMatches(next.compareSourceFile, identity)) {
        const destination = destinationFor(next.compareFieldName);
        if (destination) {
          next.compareSourceFile = destination.sourceKey;
          next.compareSourceAlias = destination.alias;
          next.compareFieldName = destination.field;
          conditionsChanged = true;
        }
      }
      if (next.compareMathJson) {
        const rewritten = atlasRewriteMathReplacement(
          next.compareMathJson,
          identity,
          destinationFor,
        );
        if (rewritten !== next.compareMathJson) {
          next.compareMathJson = rewritten;
          conditionsChanged = true;
        }
      }
      return next;
    });
    if (conditionsChanged) {
      params.conditions_json = JSON.stringify(conditions);
      if (Array.isArray(step.conditions)) step.conditions = conditions;
    }
    ["source_math_json", "then_math_json"].forEach((key) => {
      if (!params[key]) return;
      params[key] = atlasRewriteMathReplacement(
        params[key],
        identity,
        destinationFor,
      );
    });
  });
  (audit?.displayFields || []).forEach((field) => {
    atlasRewriteDisplayFieldReplacement(field, identity, destinationFor);
  });
  return audit;
}

function atlasBuildSourceReplacementGaps({
  original,
  rows,
  replacementSources,
  existing,
}) {
  const identity = atlasNormalizeReplacementIdentity(original);
  const prior = existing && typeof existing === "object" ? existing : {};
  const sameOriginal = (item) => {
    const key = item?.originalSourceKey || item?.replacedSourceKey || "";
    if (key && identity.sourceKey) return key === identity.sourceKey;
    const file = item?.originalSourceFile || item?.replacedSourceFile || "";
    return Boolean(file && identity.sourceFile && file === identity.sourceFile);
  };
  const replacementKeys = (replacementSources || [])
    .map((source) =>
      typeof source === "string"
        ? String(source).trim()
        : atlasNormalizeReplacementIdentity(source).sourceKey,
    )
    .filter(Boolean);
  const used = new Set(
    (rows || [])
      .filter((row) => row?.destination?.sourceKey)
      .map((row) => row.destination.sourceKey),
  );
  const fields = (rows || [])
    .filter((row) => row?.field && !row.destination)
    .map((row) => ({
      id: `${identity.sourceKey}::${row.field}`,
      originalSourceKey: identity.sourceKey,
      originalSourceFile: identity.sourceFile,
      originalField: row.field,
      replacementSourceKeys: replacementKeys,
    }));
  const sources = (rows || []).length
    ? (replacementSources || [])
        .map((source) => atlasNormalizeReplacementIdentity(source))
        .filter((source) => source.sourceKey && !used.has(source.sourceKey))
        .map((source) => ({
          sourceKey: source.sourceKey,
          sourceFile: source.sourceFile,
          replacedSourceKey: identity.sourceKey,
          replacedSourceFile: identity.sourceFile,
        }))
    : [];
  return {
    fields: [...(prior.fields || []).filter((item) => !sameOriginal(item)), ...fields],
    sources: [
      ...(prior.sources || []).filter((item) => !sameOriginal(item)),
      ...sources,
    ],
  };
}

function atlasReplacementMetadataForSource(identity) {
  const metadata = {};
  const remember = (field) => {
    const record = atlasReplacementCandidateFromField(field, identity);
    if (!record.field || metadata[record.field]) return;
    metadata[record.field] = {
      vanity: record.vanity,
      matchingKeys: record.matchingKeys,
    };
  };
  if (typeof fieldsForSource === "function")
    (fieldsForSource(identity.sourceKey) || []).forEach(remember);
  (state.audit?.fields || []).forEach((field) => {
    if (
      atlasReplacementSourceMatches(
        field.sourceKey || field.sourceFile,
        identity,
      )
    )
      remember(field);
  });
  return metadata;
}

function atlasReplacementCandidatesForKeys(sourceKeys) {
  const candidates = [];
  (sourceKeys || []).forEach((key) => {
    const source =
      typeof selectedSourceDetail === "function" ? selectedSourceDetail(key) : null;
    if (!source) return;
    const identity = atlasNormalizeReplacementIdentity(source);
    (source.fields || []).forEach((field) => {
      const record = atlasReplacementCandidateFromField(field, identity);
      if (record.field) candidates.push(record);
    });
  });
  return candidates;
}

function atlasRefreshReplacementMappings() {
  const session = atlasSourceReplaceState;
  if (!session) return;
  const candidates = atlasReplacementCandidatesForKeys(
    session.replacementSourceKeys,
  );
  session.rows.forEach((row) => {
    if (
      row.manual &&
      row.destination &&
      session.replacementSourceKeys.includes(row.destination.sourceKey)
    )
      return;
    row.destination = atlasAutoMatchSourceReplacement(row, candidates);
    row.manual = false;
  });
}

function atlasCloseSourceReplacement() {
  atlasSourceReplaceState = null;
  document.querySelector(".source-replace-backdrop")?.remove();
  const picker = document.getElementById("atlas-visual-picker-root");
  if (picker) picker.style.zIndex = "";
}

function atlasReplacementSourceLabel(sourceKey) {
  const source =
    typeof selectedSourceDetail === "function"
      ? selectedSourceDetail(sourceKey)
      : null;
  if (!source) return sourceKey;
  return (
    (typeof atlasSourceDisambiguatedLabel === "function"
      ? atlasSourceDisambiguatedLabel(source)
      : "") ||
    source.sourceFile ||
    source.alias ||
    sourceKey
  );
}

function atlasRaiseReplacementPicker() {
  const picker = document.getElementById("atlas-visual-picker-root");
  if (picker) picker.style.zIndex = "10160";
}

function atlasOpenReplacementSourcePicker() {
  const session = atlasSourceReplaceState;
  if (!session || typeof ATLASVisualPicker?.open !== "function") return;
  const entries = (sourceCatalogEntries?.() || [])
    .filter(
      (source) =>
        !atlasReplacementSourceMatches(
          source.sourceKey || source.sourceFile,
          session.original,
        ),
    )
    .map((source) => {
      const identity = atlasNormalizeReplacementIdentity(source);
      return {
        key: identity.sourceKey,
        label: atlasReplacementSourceLabel(identity.sourceKey),
        rawName: identity.sourceFile,
        sourceKey: identity.sourceKey,
        sourceLabel: identity.alias || identity.sourceFile,
        sourceColor:
          (state.audit?.sources || []).find(
            (item) =>
              atlasSourceMutationKey?.(item) === identity.sourceKey ||
              item.sourceKey === identity.sourceKey,
          )?.color || "#667085",
      };
    });
  atlasRaiseReplacementPicker();
  ATLASVisualPicker.open({
    mode: "source",
    title: "Replacement sources",
    guidance: "Select one or more sources to replace the original source.",
    searchPlaceholder: "Search replacement sources...",
    entries,
    multiple: true,
    selectionNoun: "source",
    selectedKeys: session.replacementSourceKeys,
    closeOnSelect: true,
    onSelect(selected) {
      const list = Array.isArray(selected) ? selected : selected ? [selected] : [];
      session.replacementSourceKeys = list
        .map((entry) => entry.sourceKey || entry.key)
        .filter(Boolean);
      atlasRefreshReplacementMappings();
      atlasRenderSourceReplacement();
    },
    onClose() {
      const picker = document.getElementById("atlas-visual-picker-root");
      if (picker) picker.style.zIndex = "";
    },
  });
}

function atlasOpenReplacementFieldPicker(oldField) {
  const session = atlasSourceReplaceState;
  if (!session || typeof ATLASVisualPicker?.open !== "function") return;
  const row = session.rows.find((item) => item.field === oldField);
  if (!row) return;
  const entries = [
    {
      key: "__unmatched__",
      label: "Leave unmatched",
      rawName: "",
      sourceKey: "",
      sourceLabel: "Unmatched",
      sourceColor: "#667085",
      destination: null,
    },
    ...atlasReplacementCandidatesForKeys(session.replacementSourceKeys).map(
      (candidate, index) => ({
        key: `${candidate.sourceKey}::${candidate.field}::${index}`,
        label: candidate.label,
        rawName: candidate.field,
        sourceKey: candidate.sourceKey,
        sourceLabel:
          candidate.alias || candidate.sourceFile || candidate.sourceKey,
        sourceColor:
          (state.audit?.sources || []).find(
            (item) =>
              atlasSourceMutationKey?.(item) === candidate.sourceKey ||
              item.sourceKey === candidate.sourceKey,
          )?.color || "#667085",
        destination: {
          sourceKey: candidate.sourceKey,
          sourceFile: candidate.sourceFile,
          alias: candidate.alias,
          field: candidate.field,
        },
      }),
    ),
  ];
  const selectedKey = row.destination
    ? entries.find(
        (entry) =>
          entry.destination?.sourceKey === row.destination.sourceKey &&
          entry.destination?.field === row.destination.field,
      )?.key
    : "__unmatched__";
  atlasRaiseReplacementPicker();
  ATLASVisualPicker.open({
    mode: "field",
    title: "Replacement field",
    guidance: `Choose one field for ${row.vanity || row.field}, or leave it unmatched.`,
    searchPlaceholder: "Search replacement fields...",
    entries,
    selectedKey,
    closeOnSelect: true,
    onSelect(entry) {
      row.destination = entry?.destination || null;
      row.manual = true;
      atlasRenderSourceReplacement();
    },
    onClose() {
      const picker = document.getElementById("atlas-visual-picker-root");
      if (picker) picker.style.zIndex = "";
    },
  });
}

function atlasRenderSourceReplacement() {
  document.querySelector(".source-replace-backdrop")?.remove();
  const session = atlasSourceReplaceState;
  if (!session) return;
  const sourceLabels = session.replacementSourceKeys.map((key) =>
    atlasReplacementSourceLabel(key),
  );
  const rows = session.rows.length
    ? session.rows
        .map((row) => {
          const destination = row.destination
            ? `${atlasReplacementSourceLabel(row.destination.sourceKey)}: ${row.destination.field}`
            : "Leave unmatched";
          const oldLabel =
            row.vanity && row.vanity !== row.field
              ? `${row.vanity} (${row.field})`
              : row.field;
          return `<tr data-source-replace-field="${esc(row.field)}">
            <td><strong>${esc(oldLabel)}</strong></td>
            <td>
              <button type="button" class="visual-picker-trigger-button source-replace-popup-trigger" data-open-source-replace-field-picker data-source-replace-old-field="${esc(row.field)}" title="Select replacement field">
                <span class="visual-picker-trigger-main"><strong>${esc(destination)}</strong></span>
                <span class="visual-picker-trigger-caret">⌄</span>
              </button>
            </td>
            <td>${row.destination ? "Mapped" : "Unmatched"}</td>
          </tr>`;
        })
        .join("")
    : '<tr><td colspan="3"><p class="hint">No manual logic or display fields from this source are currently in use. Applying replacement will update the selected sources only.</p></td></tr>';
  const root = document.createElement("div");
  root.className = "source-replace-backdrop";
  root.innerHTML = `<div class="source-replace-modal" role="dialog" aria-modal="true" aria-labelledby="sourceReplaceTitle">
    <div class="source-replace-header">
      <div>
        <h2 id="sourceReplaceTitle">Replace Source</h2>
        <p class="hint">Replace ${esc(session.original.sourceFile || session.original.sourceKey)} with one or more sources. Each field maps to one replacement field. Unmatched fields and unused replacement sources are reported as critical issues.</p>
      </div>
      <button type="button" class="visual-picker-close-button" data-close-source-replace aria-label="Close">×</button>
    </div>
    <div class="source-replace-popup-row">
      <label>Replacement sources</label>
      <button type="button" class="visual-picker-trigger-button source-replace-popup-trigger" data-open-source-replace-source-picker title="Select replacement sources">
        <span class="visual-picker-trigger-main"><strong>${esc(sourceLabels.length ? sourceLabels.join(", ") : "Choose replacement sources")}</strong></span>
        <span class="visual-picker-trigger-caret">⌄</span>
      </button>
    </div>
    <div class="tablewrap source-replace-table-wrap">
      <table class="source-replace-mapping-table">
        <thead><tr><th>Existing field</th><th>Replacement field</th><th>Status</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div class="source-replace-actions">
      <button type="button" class="btn secondary small" data-close-source-replace>Cancel</button>
      <button type="button" class="btn primary small" data-apply-source-replace ${session.replacementSourceKeys.length ? "" : "disabled"}>Apply Replacement</button>
    </div>
  </div>`;
  document.body.append(root);
  if (session.focusField) {
    root
      .querySelector(
        `[data-source-replace-field="${CSS.escape(session.focusField)}"]`,
      )
      ?.scrollIntoView?.({ block: "center" });
  }
}

function atlasOpenSourceReplacement(sourceKeyOrOptions) {
  if (
    typeof atlasAuditIsWorkflowLocked === "function" &&
    atlasAuditIsWorkflowLocked()
  ) {
    status?.("This audit is read-only while approval is pending.", "bad");
    return false;
  }
  const options =
    typeof sourceKeyOrOptions === "string"
      ? { sourceKey: sourceKeyOrOptions }
      : sourceKeyOrOptions || {};
  const sourceKey = String(options.sourceKey || "").trim();
  if (!sourceKey) return false;
  const selected =
    typeof atlasSelectedSourceByKey === "function"
      ? atlasSelectedSourceByKey(sourceKey)
      : null;
  const detail =
    typeof selectedSourceDetail === "function"
      ? selectedSourceDetail(sourceKey)
      : null;
  const gaps = state.audit?.unmatchedSourceReplacements || {
    fields: [],
    sources: [],
  };
  const gapField = (gaps.fields || []).find(
    (item) =>
      item.originalSourceKey === sourceKey ||
      item.originalSourceFile === sourceKey,
  );
  const original = atlasNormalizeReplacementIdentity(
    selected ||
      detail || {
        sourceKey,
        sourceFile: gapField?.originalSourceFile || sourceKey,
      },
  );
  if (!original.sourceKey) return false;
  const metadata = atlasReplacementMetadataForSource(original);
  const rows = atlasCollectSourceReplacementRows(state.audit, original, metadata);
  (gaps.fields || []).forEach((gap) => {
    if (
      gap.originalSourceKey !== original.sourceKey &&
      gap.originalSourceFile !== original.sourceFile
    )
      return;
    if (rows.some((row) => row.field === gap.originalField)) return;
    rows.push({
      field: gap.originalField,
      vanity: metadata[gap.originalField]?.vanity || gap.originalField,
      matchingKeys: atlasReplacementMatchingKeys(
        metadata[gap.originalField]?.matchingKeys,
      ),
      destination: null,
      manual: false,
    });
  });
  const replacementSourceKeys = [];
  const addKey = (key) => {
    const value = String(key || "").trim();
    if (!value || replacementSourceKeys.includes(value)) return;
    if (atlasReplacementSourceMatches(value, original)) return;
    replacementSourceKeys.push(value);
  };
  (gaps.fields || []).forEach((gap) => {
    if (gap.originalSourceKey !== original.sourceKey) return;
    (gap.replacementSourceKeys || []).forEach(addKey);
  });
  (gaps.sources || []).forEach((gap) => {
    if (gap.replacedSourceKey !== original.sourceKey) return;
    addKey(gap.sourceKey);
  });
  atlasSourceReplaceState = {
    original,
    replacementSourceKeys,
    rows,
    focusField: String(options.focusField || "").trim(),
  };
  atlasRefreshReplacementMappings();
  atlasRenderSourceReplacement();
  return true;
}

function atlasApplySourceReplacement() {
  const session = atlasSourceReplaceState;
  if (!session) return false;
  if (
    typeof atlasAuditIsWorkflowLocked === "function" &&
    atlasAuditIsWorkflowLocked()
  ) {
    status?.("This audit is read-only while approval is pending.", "bad");
    return false;
  }
  if (!session.replacementSourceKeys.length) {
    status?.(
      "Select at least one replacement source before applying.",
      "warn",
    );
    return false;
  }
  const resolved = [];
  for (const key of session.replacementSourceKeys) {
    const detail =
      typeof selectedSourceDetail === "function" ? selectedSourceDetail(key) : null;
    if (!detail) {
      status?.("Select a replacement source before applying.", "warn");
      return false;
    }
    resolved.push(detail);
  }
  const original = session.original;
  const oldSelected =
    typeof atlasSelectedSourceByKey === "function"
      ? atlasSelectedSourceByKey(original.sourceKey)
      : null;
  const inheritedColor = oldSelected?.color || "";
  const newlyAdded = [];
  resolved.forEach((source) => {
    const result = atlasAddSourceState(source.sourceKey || source.sourceFile);
    if (result?.changed) newlyAdded.push(result.sourceKey);
  });
  if (inheritedColor && newlyAdded.length) {
    const created = (state.audit.sources || []).find(
      (source) =>
        (typeof atlasSourceMutationKey === "function"
          ? atlasSourceMutationKey(source)
          : source.sourceKey) === newlyAdded[0],
    );
    if (created) created.color = inheritedColor;
  }
  atlasRewriteSourceReplacementReferences(
    state.audit,
    original,
    session.rows.map((row) => ({
      oldField: row.field,
      destination: row.destination,
    })),
    resolved,
  );
  if (oldSelected) atlasRemoveSourceState(original.sourceKey);
  syncAutoReferenceSteps?.();
  state.audit.unmatchedSourceReplacements = atlasBuildSourceReplacementGaps({
    original,
    rows: session.rows,
    replacementSources: resolved,
    existing: state.audit.unmatchedSourceReplacements,
  });
  if (
    typeof activeSelectedSourceName === "string" &&
    atlasReplacementSourceMatches(activeSelectedSourceName, original)
  )
    activeSelectedSourceName = "";
  const names = resolved
    .map((source) => source.sourceFile || source.sourceKey)
    .join(", ");
  const pending =
    (state.audit.unmatchedSourceReplacements.fields || []).filter(
      (item) => item.originalSourceKey === original.sourceKey,
    ).length +
    (state.audit.unmatchedSourceReplacements.sources || []).filter(
      (item) => item.replacedSourceKey === original.sourceKey,
    ).length;
  atlasCloseSourceReplacement();
  renderSources?.();
  renderSourceFieldBrowser?.();
  renderFieldPickerPanel?.();
  updateDashboardMetrics?.();
  atlasMarkFieldPickerDirty?.();
  atlasInvalidatePages?.([
    "fields",
    "steps",
    "preview",
    "review",
    "overview",
    "display-fields",
  ]);
  scheduleAutosave?.();
  ATLASAuditIssues?.invalidate?.();
  status?.(
    pending
      ? `Replaced ${original.sourceFile || original.sourceKey} with ${names}. ${pending} unmatched ${pending === 1 ? "item" : "items"} reported as critical issues.`
      : `Replaced ${original.sourceFile || original.sourceKey} with ${names}.`,
    "ok",
  );
  return true;
}

if (typeof document !== "undefined" && document.addEventListener) {
  document.addEventListener(
    "click",
    (event) => {
      const replaceButton = event.target.closest?.("[data-replace-source]");
      if (replaceButton) {
        event.preventDefault();
        event.stopImmediatePropagation();
        atlasOpenSourceReplacement(replaceButton.dataset.replaceSource || "");
        return;
      }
      const closeReplace = event.target.closest?.("[data-close-source-replace]");
      if (closeReplace) {
        event.preventDefault();
        event.stopImmediatePropagation();
        atlasCloseSourceReplacement();
        return;
      }
      if (
        event.target.classList?.contains("source-replace-backdrop")
      ) {
        atlasCloseSourceReplacement();
        return;
      }
      const sourcePicker = event.target.closest?.(
        "[data-open-source-replace-source-picker]",
      );
      if (sourcePicker) {
        event.preventDefault();
        event.stopImmediatePropagation();
        atlasOpenReplacementSourcePicker();
        return;
      }
      const fieldPicker = event.target.closest?.(
        "[data-open-source-replace-field-picker]",
      );
      if (fieldPicker) {
        event.preventDefault();
        event.stopImmediatePropagation();
        atlasOpenReplacementFieldPicker(
          fieldPicker.dataset.sourceReplaceOldField || "",
        );
        return;
      }
      const applyReplace = event.target.closest?.("[data-apply-source-replace]");
      if (applyReplace) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (applyReplace.disabled) return;
        atlasApplySourceReplacement();
      }
    },
    true,
  );
  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (!document.querySelector(".source-replace-backdrop")) return;
      event.preventDefault();
      atlasCloseSourceReplacement();
    },
    true,
  );
}
