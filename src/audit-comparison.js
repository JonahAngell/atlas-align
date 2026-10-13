import { canonicalJson, documentHash } from "./canonical-json.js";

export const CANONICAL_IDENTITY_VERSION = 2;
export const COMPARISON_CONTRACT_VERSION = 2;

/** Creates a detached copy of a value, converting undefined to null. */
const clone = (value) => (value === undefined ? null : structuredClone(value));

/** Normalizes a value into a trimmed string. */
const text = (value) => String(value ?? "").trim();

/** Serializes a value after applying deterministic object-key ordering. */
const serialized = canonicalJson;

/** Compares two values using their deterministic serialized representations. */
const equal = (left, right) => serialized(left) === serialized(right);

/** Produces a SHA-256 fingerprint for a deterministically serialized value. */
const fingerprint = documentHash;

/** Creates a comparison conflict error with an HTTP status and machine-readable code. */
const fail = (code, message) =>
  Object.assign(new Error(message), { status: 409, code });

/** Recursively identifies changed scalar values and reports their object paths. */
function scalarChanges(before, after, path = "") {
  const out = [];
  const keys = [
    ...new Set([...Object.keys(before || {}), ...Object.keys(after || {})]),
  ].sort();
  for (const key of keys) {
    const currentPath = path ? `${path}.${key}` : key;
    const left = before?.[key],
      right = after?.[key];
    if (equal(left, right)) continue;
    if (
      left &&
      right &&
      typeof left === "object" &&
      typeof right === "object" &&
      !Array.isArray(left) &&
      !Array.isArray(right)
    )
      out.push(...scalarChanges(left, right, currentPath));
    else
      out.push({ path: currentPath, before: clone(left), after: clone(right) });
  }
  return out;
}

/** Resolves the preferred stable identity from a source string or source object. */
function sourceIdentity(source) {
  if (typeof source === "string") return text(source);
  return text(
    source?.sourceKey ||
      source?.catalogKey ||
      source?.sourceReferenceId ||
      source?.id ||
      source?.file ||
      source?.sourceFile,
  );
}
/** Returns normalized source identifiers that may refer to the same source. */
function sourceIdentityCandidates(source) {
  if (typeof source === "string") {
    const value = text(source).toLowerCase();
    return value ? [value] : [];
  }
  return [
    source?.sourceKey,
    source?.catalogKey,
    source?.sourceReferenceId,
    source?.id,
    source?.file,
    source?.sourceFile,
    source?.alias,
    source?.name,
    source?.label,
  ]
    .map((value) => text(value).toLowerCase())
    .filter(Boolean);
}
/** Builds a normalized canonical identity for a displayed field. */
function displayIdentity(field) {
  if (typeof field === "string") return text(field).toLowerCase();
  const explicit = text(field?.canonicalKey || field?.key);
  if (explicit) return explicit.toLowerCase();
  const source = text(
    field?.sourceKey || field?.source || field?.sourceFile || field?.uniqueId,
  ).toLowerCase();
  const name = text(
    field?.fieldKey ||
      field?.rawFieldName ||
      field?.fieldName ||
      field?.field ||
      field?.name,
  ).toLowerCase();
  return source && name ? `${source}::${name}` : "";
}
/** Extracts a size-limited set of safe identifying properties for review summaries. */
function boundedSummary(value) {
  if (value == null) return null;
  const safe = {};
  for (const key of [
    "id",
    "sourceKey",
    "canonicalKey",
    "type",
    "step_type",
    "title",
    "name",
    "label",
    "alias",
    "fieldName",
    "rawFieldName",
    "severity",
    "parentId",
    "branchType",
  ]) {
    if (
      value?.[key] != null &&
      ["string", "number", "boolean"].includes(typeof value[key])
    )
      safe[key] = String(value[key]).slice(0, 240);
  }
  return safe;
}
/** Selects a human-readable change summary from reason codes and item type. */
function summaryFor(codes, type) {
  if (codes.includes("object_removed"))
    return "Removed since prior submission.";
  if (codes.includes("ancestor_changed"))
    return "Requires re-review: parent or ancestor changed.";
  if (codes.includes("parent_changed"))
    return "Requires re-review: parent step changed.";
  if (codes.includes("field_added")) return "New Display Field added.";
  if (codes.includes("field_removed"))
    return "Display Field removed since prior submission.";
  if (codes.includes("order_changed"))
    return type === "display-order"
      ? "Display order changed."
      : "Object order changed.";
  if (codes.includes("severity_changed"))
    return "Audit Issue severity changed.";
  if (codes.includes("applicability_changed"))
    return "Audit Issue applicability changed.";
  if (codes.includes("source_mapping_changed"))
    return "Source mapping changed.";
  if (codes.includes("object_added"))
    return type === "source" ? "New source added." : "New review object added.";
  if (codes.includes("content_changed"))
    return "Changed since prior submission: content changed.";
  return "No material change.";
}
/** Constructs a canonical audit review object and its semantic fingerprint. */
function canonicalObject(
  auditId,
  sectionKey,
  itemType,
  stablePart,
  displayLabel,
  semanticValue,
  canonicalOrder,
  extra = {},
) {
  const canonicalObjectKey = `audit:${auditId}|${itemType}:${stablePart}`;
  return {
    auditId,
    sectionKey,
    itemType,
    stableItemKey: `${itemType}:${stablePart}`,
    canonicalObjectKey,
    identityVersion: CANONICAL_IDENTITY_VERSION,
    displayLabel: text(displayLabel) || stablePart,
    semanticFingerprint: fingerprint(semanticValue),
    canonicalOrder,
    parentObjectKey: extra.parentObjectKey || null,
    linkedObjectKey: extra.linkedObjectKey || null,
    severity: extra.severity || null,
    applicability: extra.applicability ?? null,
    isDirect: extra.isDirect !== false,
    isDeleted: false,
    changeType: "unchanged",
    changeReasonCodes: [],
    changeSummary: "No material change.",
    priorObjectSummary: null,
    submittedObjectSummary: boundedSummary(
      extra.submittedValue ?? semanticValue,
    ),
  };
}
/** Validates stable step IDs, parent references, and absence of hierarchy cycles. */
function validateHierarchy(steps) {
  const byId = new Map();
  steps.forEach((step) => {
    const id = text(step?.id);
    if (!id)
      throw fail(
        "canonical_logic_id_missing",
        "A submitted logic step does not have a stable ID.",
      );
    if (byId.has(id))
      throw fail(
        "canonical_logic_id_duplicate",
        `Duplicate stable Logic step ID: ${id}.`,
      );
    byId.set(id, step);
  });
  for (const [id, step] of byId) {
    const parent = text(step?.parentId);
    if (parent && !byId.has(parent))
      throw fail(
        "canonical_logic_parent_missing",
        `Logic step ${id} references a missing parent.`,
      );
    const seen = new Set([id]);
    let cursor = parent;
    while (cursor) {
      if (seen.has(cursor))
        throw fail(
          "canonical_logic_cycle",
          "The Logic hierarchy contains a cycle.",
        );
      seen.add(cursor);
      cursor = text(byId.get(cursor)?.parentId);
    }
  }
  return byId;
}

/** Builds the complete canonical review-object collection for an audit document. */
export function buildCanonicalAuditObjects(document = {}, options = {}) {
  const auditId = text(options.auditId || document?.id);
  if (!auditId)
    throw fail(
      "canonical_audit_id_missing",
      "Audit identity is required for canonical review objects.",
    );
  const out = [];
  /** Appends a canonical object to the collection being built. */
  const add = (object) => out.push(object);
  const overview = [
    [
      "audit-name",
      "Audit name",
      document?.name ?? document?.auditName ?? document?.title,
    ],
    [
      "audit-description",
      "Audit description",
      document?.description ?? document?.purpose,
    ],
    [
      "audit-scope",
      "Scope and operating metadata",
      document?.scope ?? document?.region ?? document?.operatingMetadata,
    ],
  ];
  overview.forEach(([key, label, value], index) => {
    if (value != null && text(value) !== "")
      add(
        canonicalObject(
          auditId,
          "overview",
          "overview",
          key,
          label,
          value,
          index,
        ),
      );
  });
  const assignments = document?.assignments || {};
  for (const [index, role] of ["assigned", "backup", "developer"].entries()) {
    const value = assignments[role];
    if (Array.isArray(value) ? value.length : value)
      add(
        canonicalObject(
          auditId,
          "overview",
          "assignment",
          role,
          `${role[0].toUpperCase()}${role.slice(1)} assignment`,
          value,
          10 + index,
        ),
      );
  }
  const sources = Array.isArray(document?.sources)
    ? document.sources
    : Array.isArray(document?.selectedSources)
      ? document.selectedSources
      : [];
  const sourceKeys = new Set();
  const sourceIdentityIndex = new Map();
  sources.forEach((source, index) => {
    const key = sourceIdentity(source);
    if (!key)
      throw fail(
        "canonical_source_identity_missing",
        "A selected source does not have a canonical identity.",
      );
    const stableKey = key.toLowerCase();
    if (sourceKeys.has(stableKey))
      throw fail(
        "canonical_source_identity_ambiguous",
        `Duplicate canonical source identity: ${key}.`,
      );
    sourceKeys.add(stableKey);
    for (const candidate of sourceIdentityCandidates(source)) {
      const existing = sourceIdentityIndex.get(candidate);
      if (existing && existing !== stableKey)
        throw fail(
          "canonical_source_identity_ambiguous",
          `Ambiguous canonical source identity: ${candidate}.`,
        );
      sourceIdentityIndex.set(candidate, stableKey);
    }
    const semantic = { ...clone(source) };
    delete semantic.alias;
    delete semantic.name;
    delete semantic.label;
    delete semantic.color;
    add(
      canonicalObject(
        auditId,
        "sources",
        "source",
        stableKey,
        source?.alias || source?.name || source?.sourceFile || key,
        semantic,
        index,
        { submittedValue: source },
      ),
    );
  });
  const steps = Array.isArray(document?.steps) ? document.steps : [];
  validateHierarchy(steps);
  steps.forEach((step, index) => {
    const id = text(step.id);
    const type = text(step.step_type || step.type).toLowerCase();
    const isReference =
      step.autoGeneratedReference === true ||
      ["reference", "reference_source"].includes(type);
    const referenceSource = sourceIdentity(
      step?.sourceKey ||
        step?.source ||
        step?.sourceFile ||
        step?.params?.source_key ||
        step?.params?.source_file,
    );
    const referenceSourceKey = isReference
      ? sourceIdentityIndex.get(referenceSource.toLowerCase()) || null
      : null;
    const linked =
      isReference && referenceSourceKey
        ? `audit:${auditId}|source:${referenceSourceKey}`
        : null;
    if (isReference && !linked)
      throw fail(
        "canonical_reference_source_missing",
        "A generated Reference step cannot be linked to a canonical source.",
      );
    const semantic = clone(step);
    delete semantic.parentId;
    delete semantic.branchType;
    delete semantic.sortOrder;
    add(
      canonicalObject(
        auditId,
        "logic",
        isReference ? "logic-reference" : "logic-step",
        id,
        step.analystLogic || step.title || step.label || type || id,
        semantic,
        index,
        {
          parentObjectKey: step.parentId
            ? `audit:${auditId}|logic-step:${text(step.parentId)}`
            : null,
          linkedObjectKey: linked,
          isDirect: !isReference,
          submittedValue: step,
        },
      ),
    );
  });
  const fields = Array.isArray(document?.displayFields)
    ? document.displayFields
    : Array.isArray(document?.display_fields)
      ? document.display_fields
      : Array.isArray(document?.displayedFields)
        ? document.displayedFields
        : [];
  const fieldKeys = [];
  fields.forEach((field, index) => {
    const key = displayIdentity(field);
    if (!key)
      throw fail(
        "canonical_display_identity_missing",
        "A Display Field does not have a canonical identity.",
      );
    if (fieldKeys.includes(key))
      throw fail(
        "canonical_display_identity_ambiguous",
        `Duplicate canonical Display Field identity: ${key}.`,
      );
    fieldKeys.push(key);
    const semantic = clone(field);
    delete semantic.order;
    delete semantic.position;
    delete semantic.rowNumber;
    add(
      canonicalObject(
        auditId,
        "display-fields",
        "display-inclusion",
        key,
        field.label ||
          field.vanityLabel ||
          field.fieldName ||
          field.name ||
          key,
        semantic,
        index,
        { submittedValue: field },
      ),
    );
  });
  add(
    canonicalObject(
      auditId,
      "display-fields",
      "display-order",
      "complete-sequence",
      "Display field order",
      fieldKeys,
      fields.length,
    ),
  );
  const issues = Array.isArray(document?.auditIssues)
    ? document.auditIssues
    : [];
  issues.forEach((issue, index) => {
    const key = text(issue?.stableKey || issue?.key || issue?.id);
    if (!key)
      throw fail(
        "canonical_issue_identity_missing",
        "A submitted Audit Issue does not have a stable key.",
      );
    add(
      canonicalObject(
        auditId,
        "issues",
        "audit-issue",
        key,
        issue.message || issue.title || key,
        issue,
        index,
        {
          severity: text(issue.severity).toLowerCase() || null,
          applicability: issue.applicable !== false,
          submittedValue: issue,
        },
      ),
    );
  });
  return out;
}

/** Compares canonical audit objects and classifies additions, changes, deletions, and dependency invalidations. */
export function classifyCanonicalChanges(
  beforeDocument,
  afterDocument,
  options = {},
) {
  const hasBaseline = beforeDocument && typeof beforeDocument === "object";
  const current = buildCanonicalAuditObjects(afterDocument, options);
  if (!hasBaseline)
    return current.map((item) => ({
      ...item,
      changeType: "initial",
      changeReasonCodes: [],
      changeSummary: "Initial review object.",
    }));
  const prior = buildCanonicalAuditObjects(beforeDocument, options);
  const priorMap = new Map(
    prior.map((item) => [item.canonicalObjectKey, item]),
  );
  const currentMap = new Map(
    current.map((item) => [item.canonicalObjectKey, item]),
  );
  const changedLogic = new Set();
  const result = current.map((item) => {
    const before = priorMap.get(item.canonicalObjectKey);
    const codes = [];
    if (!before)
      codes.push(
        item.itemType === "display-inclusion" ? "field_added" : "object_added",
      );
    else {
      if (before.semanticFingerprint !== item.semanticFingerprint)
        codes.push("content_changed");
      if (before.parentObjectKey !== item.parentObjectKey)
        codes.push("parent_changed");
      if (
        item.itemType === "logic-step" &&
        before.canonicalOrder !== item.canonicalOrder
      )
        codes.push("order_changed");
      if (item.itemType === "audit-issue" && before.severity !== item.severity)
        codes.push("severity_changed");
      if (
        item.itemType === "audit-issue" &&
        before.applicability !== item.applicability
      )
        codes.push("applicability_changed");
      if (
        item.itemType === "display-order" &&
        before.semanticFingerprint !== item.semanticFingerprint
      ) {
        codes.length = 0;
        codes.push("order_changed");
      }
    }
    if (
      item.itemType === "logic-step" &&
      codes.some((code) =>
        ["content_changed", "parent_changed", "order_changed"].includes(code),
      )
    )
      changedLogic.add(item.canonicalObjectKey);
    return {
      ...item,
      changeType: !before ? "added" : codes.length ? "changed" : "unchanged",
      changeReasonCodes: [...new Set(codes)],
      changeSummary: summaryFor(codes, item.itemType),
      priorObjectSummary: before?.submittedObjectSummary || null,
    };
  });
  const byKey = new Map(result.map((item) => [item.canonicalObjectKey, item]));
  for (const item of result.filter(
    (entry) => entry.itemType === "logic-step",
  )) {
    let parent = item.parentObjectKey;
    const seen = new Set();
    while (parent) {
      if (seen.has(parent))
        throw fail(
          "canonical_logic_cycle",
          "The Logic hierarchy contains a cycle.",
        );
      seen.add(parent);
      if (changedLogic.has(parent)) {
        if (!item.changeReasonCodes.includes("ancestor_changed"))
          item.changeReasonCodes.push("ancestor_changed");
        item.changeType = "dependency-invalidated";
        item.changeSummary = summaryFor(item.changeReasonCodes, item.itemType);
        break;
      }
      parent = byKey.get(parent)?.parentObjectKey || null;
    }
  }
  for (const before of prior) {
    if (currentMap.has(before.canonicalObjectKey)) continue;
    if (
      !["source", "logic-step", "display-inclusion"].includes(before.itemType)
    )
      continue;
    const code =
      before.itemType === "display-inclusion"
        ? "field_removed"
        : "object_removed";
    result.push({
      ...before,
      isDeleted: true,
      isDirect: true,
      changeType: "deleted",
      changeReasonCodes: [code],
      changeSummary: summaryFor([code], before.itemType),
      priorObjectSummary: before.submittedObjectSummary,
      submittedObjectSummary: null,
      semanticFingerprint: fingerprint({
        deleted: true,
        prior: before.semanticFingerprint,
      }),
    });
  }
  return result;
}

/** Compares two ordered collections by stable identity and reports item-level changes. */
function collection(before, after, prefix) {
  /** Indexes collection values by their best available stable identity. */
  const keyed = (values) =>
    new Map(
      (values || []).map((value, index) => [
        text(
          value?.id ??
            value?.key ??
            value?.fieldId ??
            value?.sourceId ??
            value?.sourceKey ??
            value?.name ??
            `${prefix}:${index}`,
        ),
        { value, index },
      ]),
    );
  const left = keyed(before),
    right = keyed(after),
    out = [];
  for (const id of [...new Set([...left.keys(), ...right.keys()])].sort()) {
    const a = left.get(id),
      b = right.get(id);
    if (!a)
      out.push({
        identity: id,
        changeType: "added",
        before: null,
        after: clone(b.value),
      });
    else if (!b)
      out.push({
        identity: id,
        changeType: "removed",
        before: clone(a.value),
        after: null,
      });
    else {
      const changes = scalarChanges(a.value, b.value);
      if (changes.length)
        out.push({ identity: id, changeType: "modified", changes });
      else if (a.index !== b.index)
        out.push({
          identity: id,
          changeType: "reordered",
          beforeIndex: a.index,
          afterIndex: b.index,
        });
    }
  }
  return out;
}
/** Compares logic-step collections for content, order, and hierarchy changes. */
function stepChanges(before, after) {
  const aa = before || [],
    bb = after || [],
    am = new Map(aa.map((value, index) => [text(value.id), { value, index }])),
    bm = new Map(bb.map((value, index) => [text(value.id), { value, index }]));
  if (am.size !== aa.length || bm.size !== bb.length)
    throw fail(
      "canonical_logic_id_duplicate",
      "Duplicate step IDs cannot be compared.",
    );
  const out = {
    added: [],
    removed: [],
    modified: [],
    reordered: [],
    hierarchyChanged: [],
  };
  for (const id of [...new Set([...am.keys(), ...bm.keys()])].sort()) {
    const a = am.get(id),
      b = bm.get(id);
    if (!a) {
      out.added.push({ id, step: clone(b.value) });
      continue;
    }
    if (!b) {
      out.removed.push({ id, step: clone(a.value) });
      continue;
    }
    const hierarchy = ["parentId", "branchType"]
      .filter((key) => !equal(a.value?.[key] ?? null, b.value?.[key] ?? null))
      .map((key) => ({
        path: key,
        before: clone(a.value?.[key]),
        after: clone(b.value?.[key]),
      }));
    if (hierarchy.length) out.hierarchyChanged.push({ id, changes: hierarchy });
    const content = scalarChanges(a.value, b.value).filter(
      (change) =>
        !["parentId", "branchType", "sortOrder"].includes(change.path),
    );
    if (content.length) out.modified.push({ id, changes: content });
    if (
      a.index !== b.index ||
      Number(a.value?.sortOrder || 0) !== Number(b.value?.sortOrder || 0)
    )
      out.reordered.push({
        id,
        beforeIndex: a.index,
        afterIndex: b.index,
        beforeSortOrder: a.value?.sortOrder ?? null,
        afterSortOrder: b.value?.sortOrder ?? null,
      });
  }
  return out;
}
/** Counts the changes represented by an array or grouped change object. */
const category = (changes) =>
  Array.isArray(changes)
    ? changes.length
    : Object.values(changes).reduce((count, value) => count + value.length, 0);
/** Produces the versioned comparison contract for two complete audit documents. */
export function compareAuditDocuments(
  beforeDoc = {},
  afterDoc = {},
  meta = {},
) {
  const reserved = new Set([
    "assignments",
    "sources",
    "fields",
    "displayFields",
    "displayedFields",
    "steps",
    "attachments",
    "attachmentReferences",
  ]);
  const overviewBefore = Object.fromEntries(
    Object.entries(beforeDoc || {}).filter(([key]) => !reserved.has(key)),
  );
  const overviewAfter = Object.fromEntries(
    Object.entries(afterDoc || {}).filter(([key]) => !reserved.has(key)),
  );
  const assignments = [];
  for (const role of ["assigned", "backup", "developer"])
    for (const change of collection(
      beforeDoc?.assignments?.[role],
      afterDoc?.assignments?.[role],
      role,
    ))
      assignments.push({ role, ...change });
  const changes = {
    overview: scalarChanges(overviewBefore, overviewAfter),
    assignments,
    sources: collection(beforeDoc?.sources, afterDoc?.sources, "source"),
    fields: collection(beforeDoc?.fields, afterDoc?.fields, "field"),
    displayFields: collection(
      beforeDoc?.displayFields || beforeDoc?.displayedFields,
      afterDoc?.displayFields || afterDoc?.displayedFields,
      "displayField",
    ),
    steps: stepChanges(beforeDoc?.steps, afterDoc?.steps),
    attachments: [],
  };
  const categories = Object.entries(changes)
    .filter(([, value]) => category(value) > 0)
    .map(([key]) => key);
  const auditId = text(meta.auditId || afterDoc?.id || beforeDoc?.id);
  const canonicalChanges = auditId
    ? classifyCanonicalChanges(beforeDoc, afterDoc, { auditId })
    : [];
  return {
    contractVersion: COMPARISON_CONTRACT_VERSION,
    comparisonType: "audit",
    context: meta.context || "audit-history",
    before: meta.before || {},
    after: meta.after || {},
    hasChanges: categories.length > 0,
    summary: {
      changeCount: Object.values(changes).reduce(
        (count, value) => count + category(value),
        0,
      ),
      categoriesChanged: categories,
    },
    changes,
    canonical: {
      identityVersion: CANONICAL_IDENTITY_VERSION,
      objects: canonicalChanges,
    },
    technical: {
      jsonLineDiffAvailable: true,
      attachmentReferenceComparison: "unverified",
    },
  };
}
/** Produces the versioned comparison contract for two individual logic steps. */
export function compareSteps(beforeStep, afterStep, meta = {}) {
  const changes =
    beforeStep && afterStep
      ? scalarChanges(beforeStep, afterStep)
      : [{ path: "step", before: clone(beforeStep), after: clone(afterStep) }];
  return {
    contractVersion: 1,
    comparisonType: "step",
    context: meta.context || "step-history",
    before: meta.before || {},
    after: meta.after || {},
    hasChanges: changes.length > 0,
    summary: {
      changeCount: changes.length,
      categoriesChanged: changes.length ? ["step"] : [],
    },
    changes: { step: changes },
    technical: {
      jsonLineDiffAvailable: true,
      attachmentReferenceComparison: "unverified",
    },
  };
}
