/**
 * ATLAS adapter for the portable Audit Issue engine.
 *
 * Owns ATLAS context normalization, named evaluators, catalog loading,
 * transient caching/invalidation, legacy validation compatibility, and the
 * shared floating/Readiness issue presentation. Jump and Fix route back to
 * the owning control or update the audit in place. Issue results are not persisted.
 */
(function initializeAtlasAuditIssues(global) {
  "use strict";

  const CATALOG_URL = "./catalogs/audit-issue-rules.json";
  let catalog = null;
  let catalogError = null;
  let catalogPromise = null;
  let generation = 0;
  let cache = { generation: -1, signature: "", result: null };

  const string = (value) => (value == null ? "" : String(value));
  const blank = (value) => !string(value).trim();
  const array = (value) => (Array.isArray(value) ? value : []);
  const object = (value) =>
    value && typeof value === "object" && !Array.isArray(value) ? value : {};

  function assignmentEntries(assignments, role) {
    return array(object(assignments)[role]);
  }

  function sourceIdentity(source) {
    return string(
      object(source).sourceKey ||
        object(source).sourceFile ||
        object(source).alias ||
        object(source).name,
    ).trim();
  }

  function fieldIdentity(field) {
    const item = object(field);
    return `${string(item.sourceKey || item.sourceFile || item.source).trim()}::${string(item.rawFieldName || item.fieldName || item.name).trim()}`;
  }

  // Only these step types carry condition rows. Other types can still hold a
  // stale `conditions` array left over from a step type change.
  const CONDITION_STEP_TYPES = new Set([
    "if_then",
    "else",
    "filter_rows",
    "flag_records",
  ]);
  // Step params that hold a field, paired with the param holding its source.
  // Mirrors the logic builder field picker.
  const FIELD_SOURCE_PARAMS = [
    ["field_name", "source_file"],
    ["then_value_field", "then_value_source_file"],
    ["string_source_field", "string_source_file"],
    ["then_string_source_field", "then_string_source_file"],
  ];
  const VALUELESS_OPERATORS = new Set([
    "is blank/null",
    "is not blank/null",
    "is blank",
    "is not blank",
  ]);

  function conditionRows(step) {
    const type = string(object(step).step_type || object(step).type).trim();
    if (type && !CONDITION_STEP_TYPES.has(type)) return [];
    if (typeof global.parseStepConditions === "function") {
      try {
        return array(global.parseStepConditions(step));
      } catch (_error) {}
    }
    const params = object(step.params);
    if (params.conditions_json) {
      try {
        return array(JSON.parse(params.conditions_json));
      } catch (_error) {
        return [{ __parseError: true }];
      }
    }
    return array(step.conditions);
  }

  function meaningfulAction(step) {
    const item = object(step);
    const params = object(item.params);
    const type = string(params.then_action_type || params.action_type).trim();
    if (string(item.action).trim()) return true;
    if (type === "do_not_display") return true;
    if (type === "display_text")
      return !blank(params.then_text) && !blank(params.then_output_column);
    if (type === "set_column_value")
      return (
        !blank(params.then_target_column) && !blank(params.then_value_field)
      );
    if (type === "set_column_calculation")
      return (
        !blank(params.then_target_column) && !blank(params.then_value_field)
      );
    if (type === "set_column_string_transform")
      return (
        !blank(params.then_target_column) &&
        !blank(params.then_string_source_field) &&
        !blank(params.then_string_operation)
      );
    if (type === "freeform") return !blank(params.then_action);
    return false;
  }

  function stepNeedsAction(step) {
    const type = string(step.step_type || step.type).trim();
    return ["if_then", "else", "flag_records", "filter_rows"].includes(type);
  }

  function descendantHasAction(step, stepsByParent, visited = new Set()) {
    if (!step || visited.has(step.id)) return false;
    visited.add(step.id);
    return array(stepsByParent.get(step.id)).some(
      (child) =>
        child.enabled !== false &&
        (meaningfulAction(child) ||
          descendantHasAction(child, stepsByParent, visited)),
    );
  }

  function buildContext(
    auditInput = (
      typeof hasSelectedAudit === "function"
        ? hasSelectedAudit()
        : Boolean(state?.auditSelected)
    )
      ? atlasDisplayDocument?.() || state.audit
      : null,
  ) {
    const audit = object(auditInput);
    const sources = array(audit.sources);
    const fields = array(audit.fields);
    const steps = array(audit.steps);
    const displayFields = array(audit.displayFields);
    const displayedFieldCount = (() => {
      const liveDocument =
        auditInput &&
        auditInput ===
          (global.atlasDisplayDocument?.() ||
            (typeof state === "object" ? state?.audit : null));
      if (liveDocument && typeof global.requirementsFieldRows === "function") {
        try {
          return array(global.requirementsFieldRows({ includeNotes: false }))
            .length;
        } catch (error) {
          console.warn(
            "ATLAS Audit Issues: Display Field rows unavailable.",
            error,
          );
        }
      }
      return displayFields.filter(
        (field) => !field?.removed && field?.displayed !== false,
      ).length;
    })();
    const catalogSources = array(global.repoLibraryState?.sourceFiles);
    const sourceIdentityMap = Object.create(null);
    const registerSourceIdentity = (value, canonical) => {
      const key = string(value).trim().toLocaleLowerCase();
      if (!key || !canonical) return;
      if (!(key in sourceIdentityMap)) sourceIdentityMap[key] = canonical;
      else if (sourceIdentityMap[key] !== canonical)
        sourceIdentityMap[key] = null;
    };
    const canonicalSource = (sourceLike) => {
      if (typeof global.atlasResolveSourceIdentity === "function") {
        const resolved = global.atlasResolveSourceIdentity(
          sourceLike,
          catalogSources,
        );
        if (resolved?.ambiguous) return "";
        return string(resolved?.sourceKey || resolved?.sourceFile).trim();
      }
      return typeof sourceLike === "string"
        ? string(sourceLike).trim()
        : sourceIdentity(sourceLike);
    };
    catalogSources.forEach((source) => {
      const canonical = canonicalSource(source);
      [source.sourceKey, source.sourceFile, source.alias, source.name].forEach(
        (value) => registerSourceIdentity(value, canonical),
      );
    });
    sources.forEach((source) => {
      const canonical = canonicalSource(source);
      [source.sourceKey, source.sourceFile, source.alias, source.name].forEach(
        (value) => registerSourceIdentity(value, canonical),
      );
    });
    const canonicalForValue = (value) => {
      const raw = string(value).trim();
      const key = raw.toLocaleLowerCase();
      if (key in sourceIdentityMap) return sourceIdentityMap[key] || "";
      const canonical = canonicalSource(raw);
      if (canonical) registerSourceIdentity(raw, canonical);
      return canonical;
    };
    const sourceIds = new Set(
      sources.map((source) => canonicalSource(source)).filter(Boolean),
    );
    const knownSourceIds = new Set(
      catalogSources.map((source) => canonicalSource(source)).filter(Boolean),
    );
    const knownFieldIds = new Set();
    catalogSources.forEach((source) => {
      const canonical = canonicalSource(source);
      array(source.fields).forEach((field) => {
        const fieldName = string(
          field.rawFieldName || field.fieldName || field.name || field.label,
        ).trim();
        if (canonical && fieldName)
          knownFieldIds.add(`${canonical}::${fieldName}`);
      });
    });
    fields.forEach((field) => {
      const item = object(field);
      const canonical = canonicalForValue(
        item.sourceKey || item.sourceFile || item.source,
      );
      const fieldName = string(
        item.rawFieldName || item.fieldName || item.name,
      ).trim();
      if (canonical && fieldName)
        knownFieldIds.add(`${canonical}::${fieldName}`);
    });

    const stepsById = new Map();
    const stepsByParent = new Map();
    steps.forEach((step, index) => {
      const id = string(step.id).trim();
      if (id && !stepsById.has(id)) stepsById.set(id, step);
      const parent = string(step.parentId).trim();
      if (!stepsByParent.has(parent)) stepsByParent.set(parent, []);
      stepsByParent.get(parent).push(step);
    });

    const normalizedSteps = steps.map((step, index) => {
      const params = object(step.params);
      const conditions = conditionRows(step).map(
        (condition, conditionIndex) => ({
          ...object(condition),
          __index: conditionIndex,
        }),
      );
      return {
        id: string(step.id).trim(),
        index,
        title: string(step.title).trim(),
        type: string(step.step_type || step.type).trim(),
        enabled: step.enabled !== false,
        parentId: string(step.parentId).trim(),
        branchType: string(step.branchType || "root").trim(),
        source: string(step.source || params.source_file).trim(),
        field: string(step.field || params.field_name).trim(),
        action: string(step.action || params.then_action).trim(),
        params: { ...params },
        conditions,
        hasMeaningfulAction: meaningfulAction(step),
        descendantHasMeaningfulAction: descendantHasAction(step, stepsByParent),
      };
    });

    const supportedRelationshipJoinTypes = new Set([
      "INNER JOIN",
      "LEFT JOIN",
      "RIGHT JOIN",
      "FULL OUTER JOIN",
    ]);
    const joinRelationships = normalizedSteps.flatMap((step) => {
      const params = step.params;
      const joinType = string(params.join_type).trim().toUpperCase();
      if (
        !step.enabled ||
        step.type !== "join" ||
        !supportedRelationshipJoinTypes.has(joinType) ||
        blank(params.left_source) ||
        blank(params.right_source) ||
        blank(params.left_field) ||
        blank(params.right_field)
      )
        return [];
      const left = canonicalForValue(params.left_source);
      const right = canonicalForValue(params.right_source);
      if (
        !left ||
        !right ||
        left === right ||
        !sourceIds.has(left) ||
        !sourceIds.has(right)
      )
        return [];
      return [[left, right]];
    });
    return {
      audit: {
        name: string(audit.name),
        purpose: string(audit.purpose || audit.description),
        assignments: {
          assigned: assignmentEntries(audit.assignments, "assigned"),
          backup: assignmentEntries(audit.assignments, "backup"),
          developer: assignmentEntries(audit.assignments, "developer"),
        },
        sources: sources.map((source) => ({
          ...object(source),
          identity: sourceIdentity(source),
          canonicalIdentity: canonicalSource(source),
        })),
        fields: fields.map((field) => ({
          ...object(field),
          identity: fieldIdentity(field),
        })),
        steps: normalizedSteps,
        displayFields: displayFields.map((field) => ({ ...object(field) })),
      },
      displayedFieldCount,
      knownSourceIds: [...knownSourceIds],
      knownFieldIds: [...knownFieldIds],
      selectedSourceIds: [...sourceIds],
      sourceIdentityMap: { ...sourceIdentityMap },
      joinRelationships,
      workbookWarnings: array(global.workbookState?.warnings).map(string),
      unmatchedSourceReplacements: {
        fields: array(object(audit.unmatchedSourceReplacements).fields).map(
          (item) => ({ ...object(item) }),
        ),
        sources: array(object(audit.unmatchedSourceReplacements).sources).map(
          (item) => ({ ...object(item) }),
        ),
      },
    };
  }

  function issue(instanceId, target = {}, values = {}) {
    const control = string(values.control || target.control).trim();
    const fixKind = string(values.fixKind).trim();
    const actionData = {
      ...(fixKind ? { fixKind } : {}),
      ...(control ? { control } : {}),
      ...object(values.actionData),
    };
    const nextTarget = { ...target };
    if (control) nextTarget.control = control;
    const rest = { ...values };
    delete rest.control;
    delete rest.fixKind;
    delete rest.actionData;
    return {
      instanceId: string(instanceId),
      target: nextTarget,
      ...rest,
      ...(Object.keys(actionData).length ? { actionData } : {}),
    };
  }

  const evaluators = {
    missingTextValue(context, config) {
      const value =
        config.path === "audit.name"
          ? context.audit.name
          : context.audit.purpose;
      const control =
        config.path === "audit.name" ? "audit-name" : "audit-purpose";
      return blank(value)
        ? [
            issue(
              config.path,
              { page: "overview", field: config.path },
              { control, fixKind: "text" },
            ),
          ]
        : [];
    },
    missingAssignment(context, config) {
      return array(context.audit.assignments[config.role]).length
        ? []
        : [
            issue(
              config.role,
              {
                page: "overview",
                field: `assignments.${config.role}`,
              },
              {
                control: `assignment-${config.role}`,
                fixKind: "assignment",
              },
            ),
          ];
    },
    missingSources(context) {
      return context.audit.sources.length
        ? []
        : [
            issue(
              "sources",
              { page: "fields" },
              { control: "source-search", fixKind: "add-source" },
            ),
          ];
    },
    missingSteps(context) {
      if (!context.audit.sources.length) return [];
      return context.audit.steps.length
        ? []
        : [
            issue(
              "steps",
              { page: "steps" },
              { control: "logic-add", fixKind: "add-step" },
            ),
          ];
    },
    workbookWarnings(context) {
      return context.workbookWarnings.map((message, index) =>
        issue(
          index,
          { page: "fields" },
          {
            summary: message,
            control: "workbook-import",
            fixKind: "import",
            actionData: { message, warningIndex: index },
          },
        ),
      );
    },
    sourceAndFieldIntegrity(context) {
      const knownSources = new Set(context.knownSourceIds);
      const knownFields = new Set(context.knownFieldIds);
      const selectedSources = new Set(context.selectedSourceIds);
      const unmatchedFields = array(
        context.unmatchedSourceReplacements?.fields,
      );
      const coveredByUnmatchedReplacement = (reference, canonicalSource) => {
        const refSource = string(reference.source).trim();
        const refField = string(reference.field).trim();
        return unmatchedFields.some((gap) => {
          const gapField = string(gap.originalField).trim();
          if (!gapField || gapField !== refField) return false;
          const tokens = [gap.originalSourceKey, gap.originalSourceFile]
            .map((value) => string(value).trim())
            .filter(Boolean);
          return tokens.some(
            (token) =>
              token === refSource ||
              token === canonicalSource ||
              token.toLocaleLowerCase() ===
                string(reference.source).trim().toLocaleLowerCase(),
          );
        });
      };
      const sourceTarget = (source, index) => ({
        page: "fields",
        sourceId: string(source.id).trim(),
        sourceName: string(
          source.name || source.sourceFile || source.identity,
        ).trim(),
        sourceIndex: index,
      });
      const issues = [];
      context.audit.sources.forEach((source, index) => {
        if (!source.identity)
          issues.push(
            issue(`source-${index}-identity`, sourceTarget(source, index), {
              severity: "critical",
              summary: "A selected source has no usable identity.",
              control: "source-card",
              fixKind: "confirm",
              actionData: { repair: "remove-source", sourceIndex: index },
            }),
          );
        else if (
          knownSources.size &&
          !knownSources.has(source.canonicalIdentity || source.identity)
        )
          issues.push(
            issue(`source-${index}-missing`, sourceTarget(source, index), {
              severity: "critical",
              summary:
                "A selected source is no longer available in the source catalog.",
              control: "source-card",
              fixKind: "confirm",
              actionData: { repair: "remove-source", sourceIndex: index },
            }),
          );
      });
      context.audit.steps.forEach((step) => {
        const references = [];
        const params = step.params || {};
        const createdReference = (param) =>
          object(params[`${param}_field_ref`]).kind === "created";
        const pushOperand = (source, field, fieldParam, sourceParam) => {
          if (createdReference(fieldParam)) return;
          if (!string(source).trim() || !string(field).trim()) return;
          references.push({
            source,
            field,
            location: `param-${fieldParam}`,
            fieldParam,
            sourceParam,
          });
        };
        if (step.type === "create_column") {
          const mode = string(params.value_mode).trim();
          if (mode === "Source field value")
            pushOperand(
              params.source_file || step.source,
              params.field_name,
              "field_name",
              "source_file",
            );
          else if (mode === "Concatenate fields") {
            pushOperand(
              params.concat_source_1,
              params.concat_field_1,
              "concat_field_1",
              "concat_source_1",
            );
            pushOperand(
              params.concat_source_2,
              params.concat_field_2,
              "concat_field_2",
              "concat_source_2",
            );
          } else if (mode === "String transformation")
            pushOperand(
              params.string_source_file || params.source_file || step.source,
              params.string_source_field,
              "string_source_field",
              "string_source_file",
            );
          else if (
            mode === "Expression / calculation" ||
            mode === "Expression/Calculation"
          )
            pushOperand(
              params.source_file || step.source,
              params.expression_source_field,
              "expression_source_field",
              "source_file",
            );
        } else {
          FIELD_SOURCE_PARAMS.forEach(([fieldParam, sourceParam]) => {
            if (blank(params[fieldParam])) return;
            pushOperand(
              params[sourceParam] || params.source_file || step.source,
              params[fieldParam],
              fieldParam,
              sourceParam,
            );
          });
          if (
            blank(params.field_name) &&
            string(step.field).trim() &&
            string(step.source).trim()
          )
            references.push({
              source: step.source,
              field: step.field,
              location: "step",
            });
        }
        step.conditions.forEach((condition) => {
          references.push({
            source: condition.sourceFile || step.source,
            field: condition.fieldName || condition.field,
            location: `condition-${condition.id || condition.__index}`,
          });
          if ((condition.valueMode || "values") === "field")
            references.push({
              source: condition.compareSourceFile,
              field: condition.compareFieldName,
              location: `compare-${condition.id || condition.__index}`,
            });
        });
        references.forEach((reference) => {
          if (!reference.source || !reference.field) return;
          const locationKind = reference.location.startsWith("compare-")
            ? "compare"
            : reference.location.startsWith("condition-")
              ? "condition"
              : "step";
          const conditionId =
            locationKind === "step"
              ? ""
              : reference.location.slice(locationKind.length + 1);
          const referenceControl = (kind) => {
            if (locationKind === "step")
              return kind === "field"
                ? `param:${reference.fieldParam || "field_name"}`
                : `param:${reference.sourceParam || "source_file"}`;
            if (locationKind === "compare")
              return kind === "field"
                ? "condition-compareFieldName"
                : "condition-compareSourceFile";
            return kind === "field"
              ? "condition-fieldName"
              : "condition-sourceFile";
          };
          const referenceTarget = (kind) => ({
            page: "steps",
            stepId: step.id,
            conditionId,
            field: kind,
            control: referenceControl(kind),
          });
          const referenceData = (kind) => ({
            control: referenceControl(kind),
            fixKind: "picker",
            actionData: {
              repair: "logic-reference",
              referenceKind: kind,
              location: locationKind,
              conditionId,
              stepId: step.id,
              source: string(reference.source).trim(),
              fieldName: string(reference.field).trim(),
            },
          });
          const target = referenceTarget("source");
          const sourceKey = string(reference.source).trim().toLocaleLowerCase();
          const canonicalSource = Object.prototype.hasOwnProperty.call(
            context.sourceIdentityMap || {},
            sourceKey,
          )
            ? context.sourceIdentityMap[sourceKey]
            : string(reference.source).trim();
          const createdSourceTokens = new Set([
            "__created_columns__",
            "calculated fields",
            "calculated field",
            "created columns",
            "created column",
          ]);
          const conditionForReference = step.conditions.find(
            (condition) =>
              string(condition.id) === conditionId ||
              String(condition.__index) === conditionId,
          );
          const createdFieldRef =
            locationKind === "compare"
              ? conditionForReference?.compareFieldRef
              : conditionForReference?.fieldRef;
          const createdFieldName = string(reference.field)
            .trim()
            .toLocaleLowerCase();
          const matchingCreatedColumns = context.audit.steps.filter((item) => {
            if (item.type !== "create_column" || item.index >= step.index)
              return false;
            return (
              string(item.params?.column_name || item.field || "")
                .trim()
                .toLocaleLowerCase() === createdFieldName
            );
          });
          const attachedSourceTokens = (column) => {
            const tokens = new Set();
            let current = column;
            const seen = new Set();
            while (current?.parentId && !seen.has(current.id)) {
              seen.add(current.id);
              const parent = context.audit.steps.find(
                (item) => item.id === current.parentId,
              );
              if (!parent) break;
              if (parent.type === "reference_source") {
                [parent.params?.source_file, parent.source]
                  .map((value) => string(value).trim())
                  .filter(Boolean)
                  .forEach((value) => {
                    tokens.add(value.toLocaleLowerCase());
                    const mapped =
                      context.sourceIdentityMap?.[value.toLocaleLowerCase()];
                    if (mapped)
                      tokens.add(string(mapped).trim().toLocaleLowerCase());
                  });
                break;
              }
              current = parent;
            }
            return tokens;
          };
          const createdReferenceReason =
            createdFieldRef?.kind === "created"
              ? "created-ref"
              : createdSourceTokens.has(sourceKey) &&
                  matchingCreatedColumns.length
                ? "created-source"
                : matchingCreatedColumns.some(
                      (column) =>
                        attachedSourceTokens(column).has(sourceKey) ||
                        attachedSourceTokens(column).has(
                          string(canonicalSource).trim().toLocaleLowerCase(),
                        ),
                    )
                  ? "attached-source"
                  : matchingCreatedColumns.length &&
                      !knownFields.has(
                        `${canonicalSource}::${string(reference.field).trim()}`,
                      )
                    ? "created-name"
                    : "";
          if (createdReferenceReason) return;
          if (
            selectedSources.size &&
            !selectedSources.has(canonicalSource) &&
            !coveredByUnmatchedReplacement(reference, canonicalSource)
          )
            issues.push(
              issue(`${step.id}-${reference.location}-source`, target, {
                severity: "critical",
                summary:
                  "Logic references a source that is not selected for this audit.",
                ...referenceData("source"),
              }),
            );
          if (knownSources.size && !knownSources.has(canonicalSource))
            issues.push(
              issue(`${step.id}-${reference.location}-source-catalog`, target, {
                severity: "critical",
                summary:
                  "Logic references a source that is no longer available.",
                ...referenceData("source"),
              }),
            );
          if (
            knownFields.size &&
            !knownFields.has(`${canonicalSource}::${reference.field}`)
          )
            issues.push(
              issue(
                `${step.id}-${reference.location}-field`,
                referenceTarget("field"),
                {
                  severity: "critical",
                  summary:
                    "Logic references a field that is no longer available for its source.",
                  ...referenceData("field"),
                },
              ),
            );
        });
      });
      return issues;
    },
    unmatchedSourceReplacement(context) {
      const gaps = context.unmatchedSourceReplacements || {
        fields: [],
        sources: [],
      };
      const fieldIssues = array(gaps.fields).map((gap) => {
        const field = string(gap.originalField).trim() || "field";
        const source =
          string(gap.originalSourceFile || gap.originalSourceKey).trim() ||
          "its source";
        const replacements = array(gap.replacementSourceKeys)
          .map((key) => string(key).trim())
          .filter(Boolean);
        return issue(
          string(gap.id || `${gap.originalSourceKey}::${field}`),
          {
            page: "fields",
            gapKind: "field",
            originalSourceKey: string(gap.originalSourceKey).trim(),
            originalField: field,
          },
          {
            severity: "critical",
            summary: `Field "${field}" from ${source} was not matched. Replacement sources: ${replacements.join(", ") || "none"}.`,
            control: "source-replacement",
            fixKind: "source-replacement",
          },
        );
      });
      const sourceIssues = array(gaps.sources).map((gap) => {
        const source =
          string(gap.sourceFile || gap.sourceKey).trim() || "A source";
        const replaced =
          string(gap.replacedSourceFile || gap.replacedSourceKey).trim() ||
          "the original source";
        return issue(
          `source::${string(gap.sourceKey).trim()}`,
          {
            page: "fields",
            gapKind: "source",
            originalSourceKey: string(gap.replacedSourceKey).trim(),
            sourceKey: string(gap.sourceKey).trim(),
          },
          {
            severity: "critical",
            summary: `${source} was added as a replacement for ${replaced}, but no fields were matched to it.`,
            control: "source-replacement",
            fixKind: "source-replacement",
            actionData: { repair: "remove-replacement-source" },
          },
        );
      });
      return [...fieldIssues, ...sourceIssues];
    },
    hierarchyIntegrity(context) {
      const ids = new Set(
        context.audit.steps.map((step) => step.id).filter(Boolean),
      );
      const issues = [];
      context.audit.steps.forEach((step) => {
        if (!step.id)
          issues.push(
            issue(
              `missing-id-${step.index}`,
              { page: "steps", stepIndex: step.index },
              {
                severity: "critical",
                summary: "A logic step has no stable ID.",
                control: "logic-add",
                fixKind: "confirm",
                actionData: { repair: "assign-step-id", stepIndex: step.index },
              },
            ),
          );
        if (step.parentId && !ids.has(step.parentId))
          issues.push(
            issue(
              `${step.id}-missing-parent`,
              { page: "steps", stepId: step.id },
              {
                severity: "critical",
                summary:
                  "A logic step references a parent that no longer exists.",
                control: "logic-parent",
                fixKind: "confirm",
                actionData: { repair: "detach-step", stepId: step.id },
              },
            ),
          );
        if (step.parentId && step.branchType === "root")
          issues.push(
            issue(
              `${step.id}-nested-root`,
              { page: "steps", stepId: step.id },
              {
                severity: "warning",
                summary: "A nested step is still marked as top-level.",
                control: "logic-branch",
                fixKind: "confirm",
                actionData: { repair: "mark-child", stepId: step.id },
              },
            ),
          );
        if (!step.parentId && step.branchType !== "root")
          issues.push(
            issue(
              `${step.id}-orphan-branch`,
              { page: "steps", stepId: step.id },
              {
                severity: "warning",
                summary: "A top-level step is marked as a child branch.",
                control: "logic-branch",
                fixKind: "confirm",
                actionData: { repair: "mark-root", stepId: step.id },
              },
            ),
          );
        const seen = new Set([step.id]);
        let parentId = step.parentId;
        while (parentId) {
          if (seen.has(parentId)) {
            issues.push(
              issue(
                `${step.id}-cycle`,
                { page: "steps", stepId: step.id },
                {
                  severity: "critical",
                  summary: "The logic hierarchy contains a cycle.",
                  control: "logic-parent",
                  fixKind: "confirm",
                  actionData: { repair: "break-cycle", stepId: step.id },
                },
              ),
            );
            break;
          }
          seen.add(parentId);
          parentId =
            context.audit.steps.find((candidate) => candidate.id === parentId)
              ?.parentId || "";
        }
      });
      return issues;
    },
    conditionIntegrity(context) {
      const issues = [];
      context.audit.steps.forEach((step) => {
        step.conditions.forEach((condition) => {
          const conditionId = condition.id || "";
          const targetFor = (control) => ({
            page: "steps",
            stepId: step.id,
            conditionId,
            field: "condition",
            control,
          });
          const key = `${step.id}-${condition.id || condition.__index}`;
          const conditionIssue = (suffix, control, fixKind, values = {}) =>
            issue(`${key}-${suffix}`, targetFor(control), {
              control,
              fixKind,
              actionData: {
                stepId: step.id,
                conditionId,
                ...(values.actionData || {}),
              },
              ...(() => {
                const copy = { ...values };
                delete copy.actionData;
                return copy;
              })(),
            });
          if (condition.__parseError) {
            issues.push(
              conditionIssue("parse", "logic-step", "confirm", {
                severity: "critical",
                summary: "Condition configuration could not be parsed.",
                actionData: { repair: "reset-condition" },
              }),
            );
            return;
          }
          const field = condition.fieldName || condition.field;
          if (blank(field))
            issues.push(
              conditionIssue("field", "condition-fieldName", "picker", {
                severity: "critical",
                actionData: {
                  repair: "condition-field",
                  referenceKind: "field",
                },
              }),
            );
          if (blank(condition.operator))
            issues.push(
              conditionIssue("operator", "condition-operator", "choice", {
                severity: "critical",
                summary: "An audit condition has no comparison selected.",
                actionData: { repair: "condition-operator" },
              }),
            );
          const mode = condition.valueMode || "values";
          if (mode === "field") {
            if (blank(condition.compareSourceFile))
              issues.push(
                conditionIssue(
                  "compare-source",
                  "condition-compareSourceFile",
                  "picker",
                  {
                    severity: "critical",
                    summary: "A field comparison has no comparison source.",
                    actionData: {
                      repair: "condition-field",
                      referenceKind: "compare-source",
                    },
                  },
                ),
              );
            if (blank(condition.compareFieldName))
              issues.push(
                conditionIssue(
                  "compare-field",
                  "condition-compareFieldName",
                  "picker",
                  {
                    severity: "critical",
                    summary: "A field comparison has no comparison field.",
                    actionData: {
                      repair: "condition-field",
                      referenceKind: "compare-field",
                    },
                  },
                ),
              );
          } else if (mode === "expression" && blank(condition.expression)) {
            issues.push(
              conditionIssue("expression", "condition-expression", "text", {
                severity: "critical",
                summary: "A condition expression is blank.",
                actionData: { repair: "condition-expression" },
              }),
            );
          } else if (
            mode === "values" &&
            !VALUELESS_OPERATORS.has(string(condition.operator).trim()) &&
            blank(condition.compareValue || condition.value)
          ) {
            issues.push(
              conditionIssue("value", "condition-compareValue", "value-list", {
                severity: "warning",
                summary: "A condition has no comparison value.",
                actionData: { repair: "condition-values" },
              }),
            );
          }
          const values = string(condition.compareValue || condition.value)
            .split(/\r?\n|,/)
            .map((value) => value.trim())
            .filter(Boolean);
          if (new Set(values).size !== values.length)
            issues.push(
              conditionIssue(
                "duplicates",
                "condition-compareValue",
                "value-list",
                {
                  severity: "warning",
                  summary: "A condition contains duplicate comparison values.",
                  actionData: { repair: "dedupe-values" },
                },
              ),
            );
        });
      });
      return issues;
    },
    missingAction(context) {
      return context.audit.steps.flatMap((step) => {
        if (
          !step.enabled ||
          !stepNeedsAction(step) ||
          step.hasMeaningfulAction ||
          step.descendantHasMeaningfulAction
        )
          return [];
        return [
          issue(
            step.id,
            { page: "steps", stepId: step.id, field: "action" },
            {
              control: "param:then_action_type",
              fixKind: "composite",
              actionData: { repair: "missing-action", stepId: step.id },
            },
          ),
        ];
      });
    },
    joinIntegrity(context) {
      return context.audit.steps.flatMap((step) => {
        if (step.type !== "join") return [];
        const p = step.params;
        const joinIssue = (suffix, param, fixKind, values = {}) =>
          issue(
            `${step.id}-${suffix}`,
            {
              page: "steps",
              stepId: step.id,
              field: "join",
              control: `param:${param}`,
            },
            {
              control: `param:${param}`,
              fixKind,
              actionData: { repair: "join-param", param, stepId: step.id },
              ...values,
            },
          );
        const issues = [];
        if (blank(p.join_type))
          issues.push(
            joinIssue("type", "join_type", "choice", { severity: "warning" }),
          );
        else if (
          ![
            "INNER JOIN",
            "LEFT JOIN",
            "RIGHT JOIN",
            "FULL OUTER JOIN",
            "UNION",
          ].includes(p.join_type)
        )
          issues.push(
            joinIssue("unsupported-type", "join_type", "choice", {
              severity: "critical",
              summary: "A join uses an unsupported join type.",
            }),
          );
        if (blank(p.left_source))
          issues.push(
            joinIssue("left-source", "left_source", "picker", {
              severity: "critical",
              summary: "A join has no left source.",
            }),
          );
        if (blank(p.right_source))
          issues.push(
            joinIssue("right-source", "right_source", "picker", {
              severity: "critical",
              summary: "A join has no right source.",
            }),
          );
        if (blank(p.left_field))
          issues.push(
            joinIssue("left-field", "left_field", "picker", {
              severity: "critical",
              summary: "A join has no left key.",
            }),
          );
        if (blank(p.right_field))
          issues.push(
            joinIssue("right-field", "right_field", "picker", {
              severity: "critical",
              summary: "A join has no right key.",
            }),
          );
        return issues;
      });
    },
    createdFieldIntegrity(context) {
      const creators = new Map(
        context.audit.steps
          .filter((step) => step.type === "create_column")
          .map((step) => [step.id, step]),
      );
      const positions = new Map(
        context.audit.steps.map((step) => [step.id, step.index]),
      );
      const issues = [];
      context.audit.steps.forEach((step) => {
        const refs = [];
        Object.entries(step.params).forEach(([key, value]) => {
          if (key.endsWith("_field_ref") && value?.kind === "created")
            refs.push({
              ...object(value),
              param: key,
              control: `param:${key.slice(0, -10) || key}`,
            });
        });
        step.conditions.forEach((condition) => {
          if (condition.fieldRef?.kind === "created")
            refs.push({
              ...object(condition.fieldRef),
              conditionId: condition.id || "",
              control: "condition-fieldName",
              referenceKind: "field",
            });
          if (condition.compareFieldRef?.kind === "created")
            refs.push({
              ...object(condition.compareFieldRef),
              conditionId: condition.id || "",
              control: "condition-compareFieldName",
              referenceKind: "compare-field",
            });
        });
        refs.forEach((ref, index) => {
          const target = {
            page: "steps",
            stepId: step.id,
            conditionId: ref.conditionId || "",
            control: ref.control || "logic-step",
          };
          const base = {
            control: target.control,
            actionData: {
              stepId: step.id,
              conditionId: ref.conditionId || "",
              param: ref.param || "",
              creatorStepId: string(ref.creatorStepId).trim(),
              referenceKind: ref.referenceKind || "",
            },
          };
          if (!creators.has(ref.creatorStepId))
            issues.push(
              issue(`${step.id}-${index}-removed`, target, {
                ...base,
                severity: "critical",
                fixKind: "picker",
                summary:
                  "A created-field reference points to a removed Create Column step.",
                actionData: { ...base.actionData, repair: "clear-created-ref" },
              }),
            );
          else if ((positions.get(ref.creatorStepId) ?? Infinity) >= step.index)
            issues.push(
              issue(`${step.id}-${index}-forward`, target, {
                ...base,
                severity: "critical",
                fixKind: "choice",
                summary:
                  "A created field is referenced before its Create Column step.",
                actionData: {
                  ...base.actionData,
                  repair: "move-after-creator",
                },
              }),
            );
        });
      });
      return issues;
    },
    createdColumnName(context) {
      const names = new Map();
      const issues = [];
      context.audit.steps
        .filter((step) => step.type === "create_column")
        .forEach((step) => {
          const name = string(step.params.column_name || step.field).trim();
          const target = {
            page: "steps",
            stepId: step.id,
            field: "column_name",
            control: "param:column_name",
          };
          if (!name)
            issues.push(
              issue(`${step.id}-blank`, target, {
                control: "param:column_name",
                fixKind: "text",
                actionData: {
                  repair: "column-name",
                  param: "column_name",
                  stepId: step.id,
                },
              }),
            );
          else {
            const key = name.toLocaleLowerCase();
            if (names.has(key))
              issues.push(
                issue(`${step.id}-duplicate`, target, {
                  summary: `Created column "${name}" duplicates another created column name.`,
                  control: "param:column_name",
                  fixKind: "text",
                  actionData: {
                    repair: "column-name",
                    param: "column_name",
                    stepId: step.id,
                  },
                }),
              );
            else names.set(key, step.id);
          }
          if (step.params.value_mode === "Concatenate fields") {
            const pairs = [
              [
                "first",
                "concat_field_1",
                "concat_source_1",
                step.params.concat_field_1,
                step.params.concat_source_1,
              ],
              [
                "second",
                "concat_field_2",
                "concat_source_2",
                step.params.concat_field_2,
                step.params.concat_source_2,
              ],
            ];
            pairs.forEach(
              ([position, fieldParam, sourceParam, field, source]) => {
                if (blank(field) || blank(source))
                  issues.push(
                    issue(
                      `${step.id}-concatenate-${position}`,
                      {
                        page: "steps",
                        stepId: step.id,
                        field: "column_name",
                        control: `param:${blank(field) ? fieldParam : sourceParam}`,
                      },
                      {
                        severity: "critical",
                        summary: `A Concatenate Fields rule is missing its ${position} field or source.`,
                        control: `param:${blank(field) ? fieldParam : sourceParam}`,
                        fixKind: "composite",
                        actionData: {
                          repair: "concatenate",
                          stepId: step.id,
                          fieldParam,
                          sourceParam,
                          position,
                        },
                      },
                    ),
                  );
              },
            );
          }
        });
      return issues;
    },
    mathIntegrity(context) {
      if (typeof global.atlasValidateMathOperations !== "function") return [];
      const issues = [];
      context.audit.steps.forEach((step) => {
        const p = step.params;
        const groups = [];
        if (
          step.type === "create_column" &&
          p.value_mode === "Source field value"
        )
          groups.push({
            value: p.source_math_json || [],
            param: "source_math_json",
          });
        if (
          step.type === "if_then" &&
          p.then_action_type === "set_column_calculation"
        )
          groups.push({
            value: p.then_math_json || [],
            param: "then_math_json",
          });
        step.conditions
          .filter((condition) => condition.valueMode === "field")
          .forEach((condition) =>
            groups.push({
              value: condition.compareMathJson || [],
              param: "compareMathJson",
              conditionId: condition.id || "",
            }),
          );
        groups.forEach((group, index) => {
          array(global.atlasValidateMathOperations(group.value)).forEach(
            (problem, problemIndex) => {
              const operationMatch = /Operation (\d+)/.exec(
                string(problem.message),
              );
              const code = string(problem.code || "math");
              const control =
                code === "source" ||
                code === "field" ||
                code === "unresolved_field"
                  ? "param:then_value_field"
                  : group.conditionId
                    ? "condition-compareFieldName"
                    : `param:${group.param}`;
              issues.push(
                issue(
                  `${step.id}-${index}-${problemIndex}`,
                  {
                    page: "steps",
                    stepId: step.id,
                    conditionId: group.conditionId || "",
                    control,
                  },
                  {
                    severity:
                      problem.level === "error" ? "critical" : "warning",
                    summary: problem.message,
                    control,
                    fixKind: "composite",
                    actionData: {
                      repair: "math",
                      code,
                      param: group.param,
                      stepId: step.id,
                      conditionId: group.conditionId || "",
                      operationIndex: operationMatch
                        ? Number(operationMatch[1]) - 1
                        : 0,
                    },
                  },
                ),
              );
            },
          );
        });
      });
      return issues;
    },
    stringTransformIntegrity(context) {
      if (typeof global.atlasValidateStringTransform !== "function") return [];
      return context.audit.steps.flatMap((step) => {
        const p = step.params;
        const groups = [];
        if (
          step.type === "create_column" &&
          p.value_mode === "String transformation"
        )
          groups.push([p, ""]);
        if (
          step.type === "if_then" &&
          p.then_action_type === "set_column_string_transform"
        )
          groups.push([p, "then_"]);
        return groups.flatMap(([value, prefix], groupIndex) =>
          array(global.atlasValidateStringTransform(value, prefix)).map(
            (problem, index) => {
              const code = string(problem.code || "string");
              const param =
                code === "string_source"
                  ? `${prefix}string_source_file`
                  : code === "string_field"
                    ? `${prefix}string_source_field`
                    : code === "string_count"
                      ? `${prefix}string_character_count`
                      : code === "string_destination"
                        ? prefix
                          ? `${prefix}target_column`
                          : "column_name"
                        : `${prefix}string_operation`;
              return issue(
                `${step.id}-${groupIndex}-${index}`,
                { page: "steps", stepId: step.id, control: `param:${param}` },
                {
                  severity: problem.level === "error" ? "critical" : "warning",
                  summary: problem.message,
                  control: `param:${param}`,
                  fixKind: "composite",
                  actionData: {
                    repair: "string-transform",
                    code,
                    prefix,
                    param,
                    stepId: step.id,
                  },
                },
              );
            },
          ),
        );
      });
    },
    displayFieldIntegrity(context) {
      const seen = new Set();
      return context.audit.displayFields.flatMap((field, index) => {
        const key =
          string(field.key || field.sourceKey || field.sourceFile) +
          "::" +
          string(field.rawFieldName || field.fieldName || field.name);
        const rowKey =
          typeof global.atlasDisplayKey === "function"
            ? string(global.atlasDisplayKey(field))
            : key.toLocaleLowerCase();
        if (!key.replaceAll(":", ""))
          return [
            issue(
              `${index}-invalid`,
              { page: "display-fields", key: rowKey, displayIndex: index },
              {
                severity: "critical",
                summary:
                  "A Display Field preference has no valid field identity.",
                control: "display-row",
                fixKind: "confirm",
                actionData: { repair: "remove-display", displayIndex: index },
              },
            ),
          ];
        if (seen.has(key))
          return [
            issue(
              `${index}-duplicate`,
              { page: "display-fields", key: rowKey, displayIndex: index },
              {
                severity: "warning",
                summary: "A Display Field is selected more than once.",
                control: "display-row",
                fixKind: "confirm",
                actionData: {
                  repair: "remove-display",
                  displayIndex: index,
                  key: rowKey,
                },
              },
            ),
          ];
        seen.add(key);
        return [];
      });
    },
    noDisplayFields(context) {
      if (!context.audit.sources.length || !context.audit.steps.length)
        return [];
      return context.displayedFieldCount
        ? []
        : [
            issue(
              "display-fields",
              { page: "display-fields" },
              { control: "display-add", fixKind: "add-display" },
            ),
          ];
    },
    invalidFieldRelationship(context) {
      const selectedSources = new Set(context.selectedSourceIds);
      const adjacency = new Map();
      array(context.joinRelationships).forEach((relationship) => {
        const left = string(relationship?.[0]).trim();
        const right = string(relationship?.[1]).trim();
        if (!left || !right || left === right) return;
        if (!adjacency.has(left)) adjacency.set(left, new Set());
        if (!adjacency.has(right)) adjacency.set(right, new Set());
        adjacency.get(left).add(right);
        adjacency.get(right).add(left);
      });
      const canonicalForReference = (value) => {
        const raw = string(value).trim();
        if (!raw) return "";
        const key = raw.toLocaleLowerCase();
        return Object.prototype.hasOwnProperty.call(
          context.sourceIdentityMap || {},
          key,
        )
          ? context.sourceIdentityMap[key] || ""
          : "";
      };
      const sourcesAreConnected = (left, right) => {
        if (left === right) return true;
        const pending = [left];
        const visited = new Set();
        while (pending.length) {
          const current = pending.shift();
          if (!current || visited.has(current)) continue;
          if (current === right) return true;
          visited.add(current);
          (adjacency.get(current) || []).forEach((next) => {
            if (!visited.has(next)) pending.push(next);
          });
        }
        return false;
      };
      return context.audit.steps.flatMap((step) => {
        if (!step.enabled || step.type !== "if_then") return [];
        return step.conditions.flatMap((condition) => {
          if (
            condition.__parseError ||
            (condition.valueMode || "values") !== "field"
          )
            return [];
          const sourceValue = condition.sourceFile || step.source;
          const compareSourceValue = condition.compareSourceFile;
          const field = condition.fieldName || condition.field;
          const compareField = condition.compareFieldName;
          if (
            blank(sourceValue) ||
            blank(compareSourceValue) ||
            blank(field) ||
            blank(compareField) ||
            blank(condition.operator)
          )
            return [];
          const source = canonicalForReference(sourceValue);
          const compareSource = canonicalForReference(compareSourceValue);
          if (
            !source ||
            !compareSource ||
            !selectedSources.has(source) ||
            !selectedSources.has(compareSource) ||
            sourcesAreConnected(source, compareSource)
          )
            return [];
          const conditionId = string(condition.id).trim();
          return [
            issue(
              `${step.id}-${conditionId || condition.__index}-${source}-${compareSource}`,
              {
                page: "steps",
                stepId: step.id,
                conditionId,
                field: "condition",
                control: "condition-compareSourceFile",
              },
              {
                severity: "critical",
                summary: `${sourceValue} and ${compareSourceValue} are not connected by a direct or indirect JOIN.`,
                control: "condition-compareSourceFile",
                fixKind: "composite",
                actionData: {
                  repair: "field-relationship",
                  stepId: step.id,
                  conditionId,
                  leftSource: string(sourceValue).trim(),
                  rightSource: string(compareSourceValue).trim(),
                  leftField: string(field).trim(),
                  rightField: string(compareField).trim(),
                },
              },
            ),
          ];
        });
      });
    },
    selfFieldComparison(context) {
      const createdSourceTokens = new Set([
        "__created_columns__",
        "calculated fields",
        "calculated field",
        "created columns",
        "created column",
      ]);
      const sourceIdentityFor = (value) => {
        const raw = string(value).trim();
        if (!raw) return "";
        const key = raw.toLocaleLowerCase();
        if (createdSourceTokens.has(key)) return "__created_columns__";
        const map = context.sourceIdentityMap || {};
        if (Object.prototype.hasOwnProperty.call(map, key)) {
          const mapped = map[key];
          return mapped ? string(mapped).trim().toLocaleLowerCase() : "";
        }
        return key;
      };
      return context.audit.steps.flatMap((step) =>
        step.conditions.flatMap((condition) => {
          if (
            condition.__parseError ||
            (condition.valueMode || "values") !== "field"
          )
            return [];
          const sourceValue = condition.sourceFile || step.source;
          const compareSourceValue = condition.compareSourceFile;
          const field = condition.fieldName || condition.field;
          const compareField = condition.compareFieldName;
          if (
            blank(sourceValue) ||
            blank(compareSourceValue) ||
            blank(field) ||
            blank(compareField)
          )
            return [];
          const sourceIdentity = sourceIdentityFor(sourceValue);
          const compareIdentity = sourceIdentityFor(compareSourceValue);
          if (
            !sourceIdentity ||
            sourceIdentity !== compareIdentity ||
            string(field).trim().toLocaleLowerCase() !==
              string(compareField).trim().toLocaleLowerCase()
          )
            return [];
          const conditionId = string(condition.id).trim();
          const fieldLabel = string(field).trim();
          return [
            issue(
              `${step.id}-${conditionId || condition.__index}-self-compare`,
              {
                page: "steps",
                stepId: step.id,
                conditionId,
                field: "condition",
                control: "condition-compareFieldName",
              },
              {
                severity: "warning",
                summary: `This condition compares "${fieldLabel}" to itself. Choose a different field, or compare against a value.`,
                control: "condition-compareFieldName",
                fixKind: "picker",
                actionData: {
                  repair: "logic-reference",
                  referenceKind: "field",
                  location: "compare",
                  conditionId,
                  stepId: step.id,
                  source: string(compareSourceValue).trim(),
                  fieldName: string(compareField).trim(),
                },
              },
            ),
          ];
        }),
      );
    },
  };

  function currentAuditKey() {
    const audit = (
      typeof hasSelectedAudit === "function"
        ? hasSelectedAudit()
        : Boolean(state?.auditSelected)
    )
      ? atlasDisplayDocument?.() || state.audit
      : null;
    return string(audit?.id || audit?.name).trim();
  }

  let highlightedTarget = null;
  let highlightBound = false;

  function cssEscape(value) {
    const raw = string(value);
    if (typeof global.CSS?.escape === "function") return global.CSS.escape(raw);
    return raw.replace(/["\\]/g, "\\$&");
  }

  function nextFrame() {
    return new Promise((resolve) => {
      const enqueue =
        global.requestAnimationFrame ||
        (global.setTimeout
          ? (callback) => global.setTimeout(callback, 0)
          : (callback) => callback());
      enqueue(() => enqueue(resolve));
    });
  }

  function isHighlightable(node) {
    if (!node) return false;
    if (node.hidden || node.type === "hidden") return false;
    if (node.getAttribute?.("aria-hidden") === "true") return false;
    return true;
  }

  async function queryVisible(selector, attempts = 8) {
    const parts = string(selector)
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    if (!parts.length || typeof document === "undefined") return null;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      for (const part of parts) {
        const nodes = [...document.querySelectorAll(part)];
        const visible = nodes.find(isHighlightable);
        if (visible) return visible;
      }
      if (attempt < attempts - 1) await nextFrame();
    }
    return null;
  }

  function clearIssueHighlight() {
    highlightedTarget = null;
    if (typeof document === "undefined") return;
    document
      .querySelectorAll(
        ".atlas-issue-target, .atlas-issue-target--warning, .atlas-issue-target--critical",
      )
      .forEach((node) => {
        node.classList.remove(
          "atlas-issue-target",
          "atlas-issue-target--warning",
          "atlas-issue-target--critical",
        );
        node.removeAttribute?.("data-atlas-issue-highlight");
      });
  }

  function applyIssueHighlight(element, severity) {
    clearIssueHighlight();
    if (!element) return;
    const tone = severity === "critical" ? "critical" : "warning";
    element.classList.add("atlas-issue-target", `atlas-issue-target--${tone}`);
    element.setAttribute?.("data-atlas-issue-highlight", tone);
    highlightedTarget = element;
    if (
      !element.hasAttribute?.("tabindex") &&
      !/^(INPUT|SELECT|TEXTAREA|BUTTON|A)$/.test(element.tagName || "")
    )
      element.tabIndex = -1;
    element.focus?.({ preventScroll: false });
    element.scrollIntoView?.({ block: "center", behavior: "smooth" });
  }

  function bindHighlightClear() {
    if (highlightBound || typeof document === "undefined") return;
    highlightBound = true;
    const clearIfEdited = (event) => {
      const node = highlightedTarget;
      if (!node) return;
      if (event.target === node || node.contains?.(event.target))
        clearIssueHighlight();
    };
    document.addEventListener("input", clearIfEdited, true);
    document.addEventListener("change", clearIfEdited, true);
  }

  function controlSelector(entry) {
    const target = object(entry?.target);
    const control = string(target.control);
    const stepId = string(target.stepId);
    const conditionId = string(target.conditionId);
    const stepRoot = stepId
      ? `[data-live-editor-step-id="${cssEscape(stepId)}"]`
      : "";
    const direct = {
      "audit-name": "#auditName",
      "audit-purpose": "#auditPurpose",
      "assignment-assigned": '[data-open-assignment-picker="assigned"]',
      "assignment-backup": '[data-open-assignment-picker="backup"]',
      "assignment-developer": '[data-open-assignment-picker="developer"]',
      "source-search": "#sourceFieldSearch",
      "logic-add": "#addStepBtn",
      "display-add": "#addDisplayFieldBtn",
      "issue-refresh":
        "#atlas-readiness-issues-refresh, #atlas-audit-issues-refresh",
      "workbook-import":
        "#workbookFile, #sourceLibraryImportStatus, #sourceFieldSearch",
      "source-replacement": "#sourceFieldSearch",
    };
    if (direct[control]) return direct[control];
    if (control === "source-card") {
      if (target.sourceId)
        return `#sourcesList [data-id="${cssEscape(target.sourceId)}"]`;
      if (target.sourceName)
        return `#sourcesList [data-remove-selected-source="${cssEscape(target.sourceName)}"]`;
      return "#sourcesList, #sourceFieldSearch";
    }
    if (control === "display-row") {
      const key = string(target.key || entry.actionData?.key);
      return key
        ? `[data-display-field-row="${cssEscape(key)}"], #displayFieldsTable`
        : "#displayFieldsTable, #addDisplayFieldBtn";
    }
    if (control === "logic-step")
      return stepId
        ? `.logic-rule-card[data-id="${cssEscape(stepId)}"]`
        : "#stepsList";
    if (control === "logic-branch" && stepRoot)
      return `${stepRoot} [data-live-branch], ${stepRoot} [data-step-branch]`;
    if (control === "logic-parent" && stepRoot)
      return `${stepRoot} [data-step-parent], .logic-rule-card[data-id="${cssEscape(stepId)}"]`;
    if (conditionId && control.startsWith("condition-")) {
      const field = control.slice("condition-".length);
      const row = `${stepRoot} [data-condition-id="${cssEscape(conditionId)}"]`;
      if (
        [
          "sourceFile",
          "fieldName",
          "compareSourceFile",
          "compareFieldName",
        ].includes(field)
      )
        return `${row} [data-condition-name="${field}"], ${row} [data-condition-field="${field}"]`;
      if (field === "compareValue")
        return `${row} .condition-values-editor input, ${row} [data-condition-field="compareValue"]`;
      return `${row} [data-condition-field="${field}"]`;
    }
    if (control.startsWith("param:") && stepRoot) {
      const param = control.slice("param:".length);
      return `${stepRoot} [data-param-name="${cssEscape(param)}"], ${stepRoot} [data-param="${cssEscape(param)}"]`;
    }
    return stepRoot;
  }

  async function focusIssueControl(entry, fallbackSelector = "") {
    bindHighlightClear();
    const stepId = string(entry?.target?.stepId);
    if (stepId && typeof global.atlasRevealLogicStep === "function") {
      global.atlasRevealLogicStep(stepId, {
        highlight: false,
        includeSelectedStep: true,
        includeLogicTable: true,
        focus: false,
      });
      await nextFrame();
    }
    const selectors = [
      controlSelector(entry),
      stepId ? `.logic-rule-card[data-id="${cssEscape(stepId)}"]` : "",
      fallbackSelector,
    ].filter(Boolean);
    for (let index = 0; index < selectors.length; index += 1) {
      const target = await queryVisible(selectors[index], index === 0 ? 8 : 2);
      if (!target) continue;
      applyIssueHighlight(target, entry.severity);
      return true;
    }
    return false;
  }

  async function navigateTo(section) {
    if (typeof global.atlasNavigateToSection === "function")
      await global.atlasNavigateToSection(section);
    else if (typeof global.showSection === "function")
      global.showSection(section);
  }

  async function openOverviewTarget(entry, selector) {
    await navigateTo("overview");
    return focusIssueControl(entry, selector);
  }

  let activeFix = null;
  const auditIdentity = () =>
    string(state?.audit?.id || state?.activeAuditValue || state?.audit?.name);

  function freshIssue(key, auditKey) {
    if (auditKey !== auditIdentity()) return null;
    return current().issues.find((item) => item.stableKey === key) || null;
  }

  function closeFixDialog(restore = true) {
    const prior = activeFix;
    activeFix = null;
    prior?.root?.remove();
    if (restore && prior?.trigger?.isConnected) prior.trigger.focus?.();
  }

  function safeText(value) {
    return string(value).replace(
      /[&<>"']/g,
      (character) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[character],
    );
  }

  function openFixShell(entry, trigger, title, body) {
    closeFixDialog(false);
    const root = document.createElement("div");
    root.className = "atlas-issue-fix-backdrop";
    root.innerHTML = `<section class="atlas-issue-fix-dialog" role="dialog" aria-modal="true" aria-labelledby="atlas-fix-title" tabindex="-1"><header class="atlas-issue-fix-header"><div><h2 id="atlas-fix-title">${safeText(title)}</h2><p class="hint">${safeText(entry.summary)}</p></div><button class="btn ghost small" type="button" data-fix-cancel>Cancel</button></header><div>${body}</div><p class="atlas-issue-fix-error" role="alert" data-fix-error></p></section>`;
    document.body.append(root);
    activeFix = {
      root,
      trigger,
      key: entry.stableKey,
      auditKey: auditIdentity(),
    };
    root.addEventListener("click", (event) => {
      if (event.target === root || event.target.closest("[data-fix-cancel]"))
        closeFixDialog();
    });
    root.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeFixDialog();
        return;
      }
      if (event.key !== "Tab") return;
      const controls = [
        ...root.querySelectorAll(
          'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        ),
      ].filter(
        (control) =>
          !control.hidden && control.getAttribute("aria-hidden") !== "true",
      );
      if (!controls.length) {
        event.preventDefault();
        root.querySelector("[role=dialog]")?.focus();
        return;
      }
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
    requestAnimationFrame(() =>
      root.querySelector("textarea,input,button")?.focus(),
    );
    return activeFix;
  }

  function completeFix(message) {
    closeFixDialog();
    invalidate();
    status?.(message, "ok");
  }

  function requireFresh(fix) {
    if (freshIssue(fix.key, fix.auditKey)) return true;
    closeFixDialog();
    invalidate();
    status?.(
      "The audit or issue changed. Reopen the fix and try again.",
      "warn",
    );
    return false;
  }

  function showFixError(fix, message) {
    const error = fix.root.querySelector("[data-fix-error]");
    if (error) error.textContent = message;
  }

  function liveSteps() {
    if (!state?.audit) return [];
    if (!Array.isArray(state.audit.steps)) state.audit.steps = [];
    return state.audit.steps;
  }

  function liveStep(stepId) {
    const id = string(stepId).trim();
    return liveSteps().find((step) => string(step.id) === id) || null;
  }

  function ensureParams(step) {
    step.params = object(step.params);
    return step.params;
  }

  function commitAudit(message) {
    atlasInvalidatePages?.([
      "overview",
      "fields",
      "steps",
      "display-fields",
      "preview",
      "review",
      "export",
    ]);
    if (typeof global.renderAll === "function") global.renderAll();
    else if (typeof renderAll === "function") renderAll();
    scheduleAutosave?.();
    completeFix(message);
  }

  function sourceChoices() {
    const seen = new Set();
    return [
      ...array(global.repoLibraryState?.sourceFiles),
      ...array(state?.audit?.sources),
    ]
      .map((source) => ({
        value: string(
          source.sourceKey || source.sourceFile || source.name || source.alias,
        ).trim(),
        label: string(
          source.alias || source.sourceFile || source.name || source.sourceKey,
        ).trim(),
      }))
      .filter(
        (item) => item.value && !seen.has(item.value) && seen.add(item.value),
      );
  }

  function fieldChoices(sourceKey) {
    const wanted = string(sourceKey).trim();
    const match = [
      ...array(global.repoLibraryState?.sourceFiles),
      ...array(state?.audit?.sources),
    ].find((source) =>
      [source.sourceKey, source.sourceFile, source.name, source.alias]
        .map((value) => string(value).trim())
        .includes(wanted),
    );
    const seen = new Set();
    return array(match?.fields)
      .map((field) =>
        string(
          field.rawFieldName || field.fieldName || field.name || field.label,
        ).trim(),
      )
      .filter((name) => name && !seen.has(name) && seen.add(name));
  }

  function fixChoiceItems(options) {
    return options.map((option) => {
      const value = typeof option === "string" ? option : option.value;
      const text = typeof option === "string" ? option : option.label || value;
      return [value, text];
    });
  }

  function fixPickerMarkup(name, label, selected = "") {
    const kind = name === "field" ? "field" : "source";
    const caption = selected || "Choose...";
    return `<div class="atlas-choice-field"><span class="atlas-choice-heading">${safeText(label)}</span><div class="atlas-fix-picker"><input type="hidden" data-fix-field="${safeText(name)}" value="${safeText(selected)}"><button type="button" class="visual-picker-trigger-button${selected ? "" : " empty"}" data-fix-open-picker="${kind}" data-fix-picker-for="${safeText(name)}"><span class="visual-picker-trigger-copy"><strong>${safeText(caption)}</strong></span></button></div></div>`;
  }

  function selectMarkup(name, label, options, selected = "") {
    if (name === "source" || name === "field")
      return fixPickerMarkup(name, label, selected);
    const items = fixChoiceItems(options);
    const variant =
      name === "stepType" || name === "actionType"
        ? "cards"
        : items.length <= 4 && items.every((item) => item[1].length <= 16)
          ? "segment"
          : "chips";
    const described =
      name === "stepType"
        ? items.map(([value, text]) => [
            value,
            text,
            value === "if_then"
              ? "Add conditional IF / THEN logic."
              : value === "join"
                ? "Combine sources with Join or Union logic."
                : "Create or populate an output column.",
          ])
        : name === "actionType"
          ? items.map(([value, text]) => [
              value,
              text,
              value === "do_not_display"
                ? "Hide the matching record."
                : "Show a text response for the matching record.",
            ])
          : items;
    return `<div class="atlas-choice-field"><span class="atlas-choice-heading">${safeText(label)}</span>${
      typeof atlasChoiceControl === "function"
        ? atlasChoiceControl({
            options: described,
            selected,
            variant,
            label,
            attributes: `data-fix-field="${safeText(name)}"`,
          })
        : ""
    }</div>`;
  }

  if (typeof document !== "undefined") {
    document.addEventListener(
      "click",
      (event) => {
        const button = event.target.closest?.("[data-fix-open-picker]");
        if (!button || typeof global.ATLASVisualPicker?.open !== "function")
          return;
        event.preventDefault();
        event.stopPropagation();
        const dialog = button.closest(".atlas-issue-fix-dialog");
        const kind =
          button.dataset.fixOpenPicker === "field" ? "field" : "source";
        const name = button.dataset.fixPickerFor || kind;
        const input = button.parentElement?.querySelector(
          `[data-fix-field="${CSS.escape(name)}"]`,
        );
        const sourceValue =
          dialog?.querySelector('[data-fix-field="source"]')?.value || "";
        const entries =
          kind === "source"
            ? sourceChoices().map((item) => ({
                key: item.value,
                label: item.label,
                rawName: item.value,
                sourceKey: item.value,
                sourceLabel: item.label,
              }))
            : fieldChoices(sourceValue).map((fieldName) => ({
                key: fieldName,
                label: fieldName,
                rawName: fieldName,
                sourceKey: sourceValue || "field",
                sourceLabel: sourceValue || "Fields",
              }));
        global.ATLASVisualPicker.open({
          mode: kind,
          title: kind === "source" ? "Choose Source" : "Choose Field",
          guidance:
            kind === "field" && !sourceValue
              ? "Choose a source before choosing a field."
              : "Choose a replacement. Search if the list is long.",
          entries,
          selectedKey: input?.value || null,
          onSelect(entry) {
            if (!input || !entry) return;
            const value = String(entry.rawName || entry.key || "");
            input.value = value;
            const strong = button.querySelector("strong");
            if (strong)
              strong.textContent = entry.label || value || "Choose...";
            button.classList.toggle("empty", !value);
            input.dispatchEvent(new Event("change", { bubbles: true }));
            if (kind !== "source") return;
            const fieldInput = dialog?.querySelector(
              '[data-fix-field="field"]',
            );
            const fieldButton = dialog?.querySelector(
              '[data-fix-open-picker="field"]',
            );
            if (fieldInput) {
              fieldInput.value = "";
              fieldInput.dispatchEvent(new Event("change", { bubbles: true }));
            }
            const fieldStrong = fieldButton?.querySelector("strong");
            if (fieldStrong) fieldStrong.textContent = "Choose...";
            fieldButton?.classList.add("empty");
          },
        });
      },
      true,
    );
  }

  function actionRow(saveLabel) {
    return `<div class="atlas-issue-fix-actions"><button class="btn ghost" type="button" data-fix-cancel>Cancel</button><button class="btn primary" type="button" data-fix-save>${safeText(saveLabel)}</button></div>`;
  }

  function readConditions(step) {
    return conditionRows(step).filter((condition) => !condition.__parseError);
  }

  function writeConditions(step, conditions) {
    if (typeof global.atlasWriteLiveEditorConditions === "function")
      global.atlasWriteLiveEditorConditions(step, conditions);
    else {
      ensureParams(step).conditions_json = JSON.stringify(conditions);
      step.conditions = conditions;
    }
  }

  function patchCondition(step, conditionId, patch) {
    const conditions = readConditions(step);
    let index = conditions.findIndex(
      (condition) => string(condition.id) === string(conditionId),
    );
    if (index < 0 && conditions.length === 1) index = 0;
    if (index < 0) return false;
    Object.assign(conditions[index], patch);
    writeConditions(step, conditions);
    return true;
  }

  function operatorChoices() {
    if (typeof global.catalogArrayFromOptions === "function") {
      const values = array(
        global.catalogArrayFromOptions({
          path: "app_config.logic_options.operators",
          fallback: ["is equal to"],
        }),
      );
      if (values.length) return values.map(string);
    }
    return [
      "is equal to",
      "is not equal to",
      "contains",
      "does not contain",
      "is greater than",
      "is less than",
      "is blank",
      "is not blank",
    ];
  }

  function bindFixSave(fix, save) {
    fix.root.querySelector("[data-fix-save]").onclick = () => {
      if (!requireFresh(fix)) return;
      const result = save();
      if (result === false) return;
      if (result && typeof result.then === "function") {
        result.catch((error) =>
          showFixError(
            fix,
            string(error?.message) || "The fix could not be saved.",
          ),
        );
      }
    };
  }

  const fixActions = {
    editAuditPurpose(entry, trigger) {
      const fix = openFixShell(
        entry,
        trigger,
        "Add Audit Description",
        '<label>Audit Description<textarea data-fix-purpose></textarea></label><div class="atlas-issue-fix-actions"><button class="btn ghost" type="button" data-fix-cancel>Cancel</button><button class="btn primary" type="button" data-fix-save>Save description</button></div>',
      );
      const input = fix.root.querySelector("[data-fix-purpose]");
      input.value = string(state.audit?.purpose);
      fix.root.querySelector("[data-fix-save]").onclick = () => {
        if (!freshIssue(fix.key, fix.auditKey)) {
          closeFixDialog();
          invalidate();
          status?.(
            "The audit or issue changed. Reopen the fix and try again.",
            "warn",
          );
          return;
        }
        const value = input.value.trim();
        if (!value) {
          fix.root.querySelector("[data-fix-error]").textContent =
            "Enter an Audit Description before saving.";
          input.focus();
          return;
        }
        state.audit.purpose = value;
        const owner = document.querySelector("#auditPurpose");
        if (owner) owner.value = value;
        atlasInvalidatePages?.(["overview", "review"]);
        scheduleAutosave?.();
        completeFix("Audit Description updated.");
      };
      return true;
    },
    addAssignment(entry, trigger) {
      const role =
        string(entry.target?.field).split(".").pop() ||
        string(entry.instanceId);
      const labels = {
        assigned: "Assigned Analyst",
        backup: "Backup Analyst",
        developer: "Developer",
      };
      const api = global.ATLASAssignmentEditor;
      if (!labels[role] || typeof api?.open !== "function")
        throw Object.assign(new Error("Assignment adapter unavailable."), {
          userMessage:
            "The assignment selector is unavailable. Open Audit Overview to update the assignment.",
        });
      const auditKey = auditIdentity();
      const issueKey = entry.stableKey;
      return api.open(role, {
        trigger,
        validateSelection() {
          return Boolean(freshIssue(issueKey, auditKey));
        },
        onAssigned() {
          invalidate();
          status?.(`${labels[role]} updated.`, "ok");
        },
      });
    },
    addSource(entry, trigger) {
      if (
        !global.ATLASVisualPicker ||
        typeof global.ATLASVisualPicker.open !== "function" ||
        typeof global.sourceCatalogEntries !== "function" ||
        typeof global.addSourceFileToAudit !== "function"
      )
        throw Object.assign(new Error("Source adapter unavailable."), {
          userMessage:
            "The source selector is unavailable. Open Sources to add the required source.",
        });
      const auditKey = auditIdentity();
      const entries = global.sourceCatalogEntries().map((item) => ({
        key: string(item.sourceKey || item.sourceFile),
        label: string(
          global.sourceCatalogDisplayName?.(item) ||
            item.alias ||
            item.sourceFile,
        ),
        rawName: string(item.sourceFile || item.sourceKey),
        sourceKey: string(item.sourceKey || item.sourceFile),
        sourceLabel: string(
          global.sourceCatalogDisplayName?.(item) || item.sourceFile,
        ),
        sourceColor: "#667085",
      }));
      return global.ATLASVisualPicker.open({
        mode: "source",
        title: "Add Source",
        entries,
        onSelect(item) {
          if (!freshIssue(entry.stableKey, auditKey)) {
            invalidate();
            status?.(
              "The audit or issue changed. Reopen the source selector and try again.",
              "warn",
            );
            return;
          }
          if (global.addSourceFileToAudit(item.sourceKey || item.key)) {
            invalidate();
            status?.("Audit source updated.", "ok");
            trigger?.focus?.();
          }
        },
      });
    },
    editAuditName(entry, trigger) {
      const fix = openFixShell(
        entry,
        trigger,
        "Add Audit Name",
        `<label>Audit Name<input data-fix-name></label>${actionRow("Save name")}`,
      );
      const input = fix.root.querySelector("[data-fix-name]");
      input.value = string(state.audit?.name);
      bindFixSave(fix, () => {
        const value = input.value.trim();
        if (!value) {
          showFixError(fix, "Enter an Audit Name before saving.");
          input.focus();
          return false;
        }
        state.audit.name = value;
        const owner = document.querySelector("#auditName");
        if (owner) owner.value = value;
        commitAudit("Audit Name updated.");
      });
      return true;
    },
    addLogicStep(entry, trigger) {
      const fix = openFixShell(
        entry,
        trigger,
        "Add logic step",
        `${selectMarkup(
          "stepType",
          "Step type",
          [
            { value: "if_then", label: "IF / THEN" },
            { value: "join", label: "Join sources" },
            { value: "create_column", label: "Create column" },
          ],
          "if_then",
        )}${actionRow("Add step")}`,
      );
      bindFixSave(fix, () => {
        const type =
          fix.root.querySelector('[data-fix-field="stepType"]').value ||
          "if_then";
        const id =
          typeof global.uid === "function"
            ? global.uid("step")
            : `step_${Date.now()}`;
        const step = {
          id,
          enabled: true,
          parentId: null,
          branchType: "root",
          sortOrder: liveSteps().length + 1,
          title:
            type === "join"
              ? "Join sources"
              : type === "create_column"
                ? "Create column"
                : "IF / THEN",
          type: type === "if_then" ? "if" : type,
          step_type: type,
          source: "",
          field: "",
          action: "",
          notes: "",
          conditions:
            type === "if_then"
              ? [
                  {
                    id:
                      typeof global.uid === "function"
                        ? global.uid("cond")
                        : `cond_${Date.now()}`,
                    fieldName: "",
                    operator: "is equal to",
                    valueMode: "values",
                    compareValue: "",
                  },
                ]
              : [],
          params:
            type === "join"
              ? { join_type: "INNER JOIN" }
              : type === "create_column"
                ? { column_name: "", value_mode: "Static value" }
                : { then_action_type: "freeform" },
        };
        liveSteps().push(step);
        if (state) state.selectedStepId = id;
        commitAudit("Logic step added.");
      });
      return true;
    },
    addDisplayField(entry, trigger) {
      if (typeof global.atlasOpenDisplayPicker !== "function")
        throw Object.assign(new Error("Display picker unavailable."), {
          userMessage:
            "The Display Field picker is unavailable. Open Display Fields to add a field.",
        });
      const opened = global.atlasOpenDisplayPicker();
      if (opened === false)
        throw Object.assign(new Error("Display picker unavailable."), {
          userMessage:
            "The Display Field picker is unavailable. Open Display Fields to add a field.",
        });
      trigger?.focus?.();
      return true;
    },
    repairSourceReplacement(entry) {
      const sourceKey = string(
        entry.target?.originalSourceKey || entry.target?.sourceKey,
      );
      if (
        entry.actionData?.repair === "remove-replacement-source" &&
        !sourceKey
      )
        throw Object.assign(new Error("Replacement source unavailable."), {
          userMessage:
            "The replacement source could not be opened. Open Sources to finish the mapping.",
        });
      if (typeof global.atlasOpenSourceReplacement !== "function" || !sourceKey)
        throw Object.assign(new Error("Replacement tool unavailable."), {
          userMessage:
            "The source mapping tool is unavailable. Open Sources to finish the replacement.",
        });
      const opened = global.atlasOpenSourceReplacement({
        sourceKey,
        focusField: string(entry.target?.originalField),
      });
      if (opened === false)
        throw Object.assign(new Error("Replacement tool unavailable."), {
          userMessage:
            "The source mapping tool is unavailable. Open Sources to finish the replacement.",
        });
      return true;
    },
    retryIssueCheck(entry, trigger) {
      const fix = openFixShell(
        entry,
        trigger,
        "Retry issue check",
        `<p>Run the audit issue checks again.</p>${actionRow("Retry check")}`,
      );
      bindFixSave(fix, async () => {
        catalogPromise = null;
        catalogError = null;
        await loadCatalog();
        if (catalogError) {
          showFixError(fix, "The issue rules still could not be loaded.");
          return false;
        }
        commitAudit("Audit issue checks were run again.");
      });
      return true;
    },
    repairIssue(entry, trigger) {
      return openRepairDialog(entry, trigger);
    },
  };

  function applyRepair(data) {
    const repair = string(data.repair);
    const step = data.stepId ? liveStep(data.stepId) : null;
    if (repair === "remove-source") {
      const sources = array(state.audit?.sources);
      const index = Number(data.sourceIndex);
      if (!Number.isInteger(index) || !sources[index])
        return "That source is no longer on the audit.";
      sources.splice(index, 1);
      return "";
    }
    if (repair === "assign-step-id") {
      const index = Number(data.stepIndex);
      const target = liveSteps()[index];
      if (!target) return "That logic step is no longer on the audit.";
      if (!string(target.id).trim())
        target.id =
          typeof global.uid === "function"
            ? global.uid("step")
            : `step_${Date.now()}`;
      return "";
    }
    if (
      !step &&
      [
        "detach-step",
        "mark-child",
        "mark-root",
        "break-cycle",
        "reset-condition",
        "column-name",
        "concatenate",
        "missing-action",
        "join-param",
        "math",
        "string-transform",
        "field-relationship",
        "condition-field",
        "condition-operator",
        "condition-expression",
        "condition-values",
        "dedupe-values",
        "clear-created-ref",
        "move-after-creator",
        "logic-reference",
      ].includes(repair)
    )
      return "That logic step is no longer on the audit.";
    if (
      repair === "detach-step" ||
      repair === "break-cycle" ||
      repair === "mark-root"
    ) {
      step.parentId = null;
      step.branchType = "root";
      return "";
    }
    if (repair === "mark-child") {
      step.branchType = "then";
      return "";
    }
    if (repair === "reset-condition") {
      ensureParams(step).conditions_json = JSON.stringify([
        {
          id:
            typeof global.uid === "function"
              ? global.uid("cond")
              : `cond_${Date.now()}`,
          fieldName: "",
          operator: "is equal to",
          valueMode: "values",
          compareValue: "",
        },
      ]);
      step.conditions = [];
      return "";
    }
    if (repair === "remove-display") {
      const fields = array(state.audit?.displayFields);
      const index = Number(data.displayIndex);
      if (!Number.isInteger(index) || !fields[index])
        return "That Display Field is no longer selected.";
      fields.splice(index, 1);
      return "";
    }
    if (repair === "remove-replacement-source") {
      const gaps = object(state.audit?.unmatchedSourceReplacements);
      const sourceKey = string(data.sourceKey || data.originalSourceKey);
      gaps.sources = array(gaps.sources).filter(
        (item) => string(item.sourceKey) !== sourceKey,
      );
      state.audit.unmatchedSourceReplacements = gaps;
      return "";
    }
    return null;
  }

  function openRepairDialog(entry, trigger) {
    const data = object(entry.actionData);
    const repair = string(data.repair || data.fixKind);
    const step = data.stepId ? liveStep(data.stepId) : null;
    if (repair === "import") {
      const fix = openFixShell(
        entry,
        trigger,
        "Workbook import warning",
        `<p>${safeText(data.message || entry.summary)}</p>${actionRow("Dismiss warning")}`,
      );
      bindFixSave(fix, () => {
        if (global.workbookState)
          global.workbookState.warnings = array(
            global.workbookState.warnings,
          ).filter(
            (warning) =>
              string(warning) !== string(data.message || entry.summary),
          );
        commitAudit("Workbook warning dismissed.");
      });
      return true;
    }
    if (
      [
        "remove-source",
        "assign-step-id",
        "detach-step",
        "mark-child",
        "mark-root",
        "break-cycle",
        "reset-condition",
        "remove-display",
      ].includes(repair)
    ) {
      const labels = {
        "remove-source": [
          "Remove source",
          "Remove this source from the audit.",
        ],
        "assign-step-id": [
          "Assign step ID",
          "Give this logic step a stable ID.",
        ],
        "detach-step": [
          "Detach step",
          "Make this step top-level so it no longer points at a missing parent.",
        ],
        "mark-child": [
          "Mark as child",
          "Mark this nested step as a child branch.",
        ],
        "mark-root": ["Mark as top-level", "Mark this step as top-level."],
        "break-cycle": [
          "Break cycle",
          "Detach this step so the hierarchy is no longer circular.",
        ],
        "reset-condition": [
          "Replace condition",
          "Replace the unreadable condition with a blank condition.",
        ],
        "remove-display": [
          "Remove Display Field",
          "Remove this invalid or duplicate Display Field selection.",
        ],
      };
      const [title, body] = labels[repair];
      const fix = openFixShell(
        entry,
        trigger,
        title,
        `<p>${safeText(body)}</p>${actionRow(title)}`,
      );
      bindFixSave(fix, () => {
        const error = applyRepair(data);
        if (error) {
          showFixError(fix, error);
          return false;
        }
        commitAudit("Audit issue updated.");
      });
      return true;
    }
    if (
      repair === "column-name" ||
      repair === "condition-expression" ||
      data.fixKind === "text"
    ) {
      const multiline = repair === "condition-expression";
      const fix = openFixShell(
        entry,
        trigger,
        multiline ? "Edit expression" : "Edit value",
        `<label>${safeText(multiline ? "Expression" : "Value")}${multiline ? "<textarea data-fix-text></textarea>" : "<input data-fix-text>"}</label>${actionRow("Save")}`,
      );
      const input = fix.root.querySelector("[data-fix-text]");
      if (repair === "column-name" && step)
        input.value = string(step.params?.column_name || step.field);
      else if (repair === "condition-expression" && step) {
        const condition = readConditions(step).find(
          (item) => string(item.id) === string(data.conditionId),
        );
        input.value = string(condition?.expression);
      }
      bindFixSave(fix, () => {
        const value = input.value.trim();
        if (!value) {
          showFixError(fix, "Enter a value before saving.");
          input.focus();
          return false;
        }
        if (repair === "column-name") {
          if (!step) {
            showFixError(fix, "That logic step is no longer on the audit.");
            return false;
          }
          const duplicate = liveSteps().some(
            (candidate) =>
              candidate !== step &&
              string(candidate.step_type || candidate.type) ===
                "create_column" &&
              string(candidate.params?.column_name || candidate.field)
                .trim()
                .toLocaleLowerCase() === value.toLocaleLowerCase(),
          );
          if (duplicate) {
            showFixError(fix, "Another created column already uses that name.");
            return false;
          }
          ensureParams(step).column_name = value;
          step.field = value;
        } else if (
          !patchCondition(step, data.conditionId, { expression: value })
        ) {
          showFixError(fix, "That condition is no longer on the step.");
          return false;
        }
        commitAudit("Audit issue updated.");
      });
      return true;
    }
    if (
      repair === "condition-operator" ||
      (repair === "join-param" && data.param === "join_type")
    ) {
      const options =
        data.param === "join_type"
          ? [
              "INNER JOIN",
              "LEFT JOIN",
              "RIGHT JOIN",
              "FULL OUTER JOIN",
              "UNION",
            ]
          : operatorChoices();
      const current = step
        ? data.param === "join_type"
          ? string(step.params?.join_type)
          : string(
              readConditions(step).find(
                (item) => string(item.id) === string(data.conditionId),
              )?.operator,
            )
        : "";
      const fix = openFixShell(
        entry,
        trigger,
        data.param === "join_type" ? "Choose join type" : "Choose operator",
        `${selectMarkup("choice", data.param === "join_type" ? "Join type" : "Operator", options, current)}${actionRow("Save")}`,
      );
      bindFixSave(fix, () => {
        const value = fix.root.querySelector('[data-fix-field="choice"]').value;
        if (!value) {
          showFixError(fix, "Choose a value before saving.");
          return false;
        }
        if (data.param === "join_type") {
          if (!step) {
            showFixError(fix, "That logic step is no longer on the audit.");
            return false;
          }
          ensureParams(step).join_type = value;
        } else if (
          !patchCondition(step, data.conditionId, { operator: value })
        ) {
          showFixError(fix, "That condition is no longer on the step.");
          return false;
        }
        commitAudit("Audit issue updated.");
      });
      return true;
    }
    if (repair === "condition-values" || repair === "dedupe-values") {
      const condition = step
        ? readConditions(step).find(
            (item) => string(item.id) === string(data.conditionId),
          )
        : null;
      const current = string(condition?.compareValue || condition?.value);
      const fix = openFixShell(
        entry,
        trigger,
        repair === "dedupe-values"
          ? "Remove duplicate values"
          : "Edit comparison values",
        `<label>Comparison values<textarea data-fix-text>${safeText(current)}</textarea></label>${actionRow(repair === "dedupe-values" ? "Remove duplicates" : "Save values")}`,
      );
      bindFixSave(fix, () => {
        const raw = fix.root.querySelector("[data-fix-text]").value;
        const parts = raw
          .split(/\r?\n|,/)
          .map((item) => item.trim())
          .filter(Boolean);
        const next = repair === "dedupe-values" ? [...new Set(parts)] : parts;
        if (!next.length) {
          showFixError(fix, "Enter at least one comparison value.");
          return false;
        }
        if (
          !patchCondition(step, data.conditionId, {
            compareValue: next.join("\n"),
            valueMode: "values",
          })
        ) {
          showFixError(fix, "That condition is no longer on the step.");
          return false;
        }
        commitAudit("Comparison values updated.");
      });
      return true;
    }
    if (repair === "move-after-creator") {
      const fix = openFixShell(
        entry,
        trigger,
        "Move step after its created column",
        `<p>Move this step so it comes after the Create Column step it references.</p>${actionRow("Move step")}`,
      );
      bindFixSave(fix, () => {
        const steps = liveSteps();
        const from = steps.findIndex(
          (item) => string(item.id) === string(data.stepId),
        );
        if (from < 0) {
          showFixError(fix, "That logic step is no longer on the audit.");
          return false;
        }
        const [moved] = steps.splice(from, 1);
        const creator = steps.findIndex(
          (item) => string(item.id) === string(data.creatorStepId),
        );
        if (creator < 0) {
          steps.splice(from, 0, moved);
          showFixError(
            fix,
            "The Create Column step is no longer on the audit.",
          );
          return false;
        }
        steps.splice(creator + 1, 0, moved);
        commitAudit("Logic step moved.");
      });
      return true;
    }
    if (repair === "missing-action") {
      const options = [
        { value: "freeform", label: "Freeform text" },
        { value: "display_text", label: "Display text" },
        { value: "do_not_display", label: "Do not display" },
        { value: "set_column_value", label: "Set column value" },
      ];
      const fix = openFixShell(
        entry,
        trigger,
        "Add action",
        `${selectMarkup("actionType", "Action type", options, "do_not_display")}<label>Action text<textarea data-fix-text></textarea></label>${actionRow("Save action")}`,
      );
      bindFixSave(fix, () => {
        if (!step) {
          showFixError(fix, "That logic step is no longer on the audit.");
          return false;
        }
        const type = fix.root.querySelector(
          '[data-fix-field="actionType"]',
        ).value;
        const text = fix.root.querySelector("[data-fix-text]").value.trim();
        if (!type) {
          showFixError(fix, "Choose an action type.");
          return false;
        }
        if (type !== "do_not_display" && !text) {
          showFixError(fix, "Enter the action text.");
          return false;
        }
        const params = ensureParams(step);
        params.then_action_type = type;
        params.then_action =
          text ||
          (type === "do_not_display" ? "Do not display matching records" : "");
        if (type === "display_text") params.then_text = text;
        step.action = params.then_action;
        commitAudit("Action updated.");
      });
      return true;
    }
    if (repair === "concatenate") {
      const fix = openFixShell(
        entry,
        trigger,
        `Set ${data.position || ""} concatenate field`,
        `${selectMarkup("source", "Source", sourceChoices())}${selectMarkup("field", "Field", [])}${actionRow("Save field")}`,
      );
      const sourceSelect = fix.root.querySelector('[data-fix-field="source"]');
      const fieldSelect = fix.root.querySelector('[data-fix-field="field"]');
      const fillFields = () => {
        if (!fieldSelect || fieldSelect.tagName !== "SELECT") return;
        const selected = fieldSelect.value;
        fieldSelect.innerHTML = `<option value="">Choose...</option>${fieldChoices(
          sourceSelect.value,
        )
          .map(
            (name) =>
              `<option value="${safeText(name)}">${safeText(name)}</option>`,
          )
          .join("")}`;
        if (
          [...fieldSelect.options].some((option) => option.value === selected)
        )
          fieldSelect.value = selected;
      };
      sourceSelect.addEventListener("change", fillFields);
      bindFixSave(fix, () => {
        if (!step) {
          showFixError(fix, "That logic step is no longer on the audit.");
          return false;
        }
        if (!sourceSelect.value || !fieldSelect.value) {
          showFixError(fix, "Choose a source and a field.");
          return false;
        }
        const params = ensureParams(step);
        params[data.sourceParam] = sourceSelect.value;
        params[data.fieldParam] = fieldSelect.value;
        commitAudit("Concatenate field updated.");
      });
      return true;
    }
    if (repair === "field-relationship") {
      const fix = openFixShell(
        entry,
        trigger,
        "Fix field comparison",
        `<p>Change the compared fields, or add a JOIN between these sources.</p>${selectMarkup("source", "Comparison source", sourceChoices(), string(data.rightSource))}${selectMarkup("field", "Comparison field", fieldChoices(data.rightSource), string(data.rightField))}<div class="atlas-issue-fix-actions"><button class="btn ghost" type="button" data-fix-cancel>Cancel</button><button class="btn secondary" type="button" data-fix-join>Add JOIN</button><button class="btn primary" type="button" data-fix-save>Save comparison</button></div>`,
      );
      const sourceSelect = fix.root.querySelector('[data-fix-field="source"]');
      const fieldSelect = fix.root.querySelector('[data-fix-field="field"]');
      sourceSelect.addEventListener("change", () => {
        if (!fieldSelect || fieldSelect.tagName !== "SELECT") return;
        fieldSelect.innerHTML = `<option value="">Choose...</option>${fieldChoices(
          sourceSelect.value,
        )
          .map(
            (name) =>
              `<option value="${safeText(name)}">${safeText(name)}</option>`,
          )
          .join("")}`;
      });
      fix.root.querySelector("[data-fix-join]").onclick = () => {
        if (!requireFresh(fix)) return;
        const id =
          typeof global.uid === "function"
            ? global.uid("step")
            : `step_${Date.now()}`;
        liveSteps().push({
          id,
          enabled: true,
          parentId: null,
          branchType: "root",
          sortOrder: liveSteps().length + 1,
          title: "Join sources",
          type: "join",
          step_type: "join",
          source: "",
          field: "",
          action: "",
          notes: "",
          conditions: [],
          params: {
            join_type: "INNER JOIN",
            left_source: string(data.leftSource),
            right_source: string(data.rightSource),
            left_field: "",
            right_field: "",
          },
        });
        if (state) state.selectedStepId = id;
        commitAudit(
          "JOIN step added. Set its keys to finish the relationship.",
        );
      };
      bindFixSave(fix, () => {
        if (!sourceSelect.value || !fieldSelect.value) {
          showFixError(fix, "Choose a comparison source and field.");
          return false;
        }
        if (
          !patchCondition(step, data.conditionId, {
            valueMode: "field",
            compareSourceFile: sourceSelect.value,
            compareFieldName: fieldSelect.value,
          })
        ) {
          showFixError(fix, "That condition is no longer on the step.");
          return false;
        }
        commitAudit("Field comparison updated.");
      });
      return true;
    }
    if (repair === "math" || repair === "string-transform") {
      const label =
        repair === "math" ? "Edit calculation" : "Edit string transformation";
      const numeric = [
        "operand",
        "number",
        "divide_zero",
        "string_count",
      ].includes(string(data.code));
      const textual = ["string_destination", "malformed_json"].includes(
        string(data.code),
      );
      const sourceLike = [
        "source",
        "string_source",
        "field",
        "string_field",
        "unresolved_field",
        "math_operand_identifier",
        "math_operand_non_numeric_metadata",
        "math_operand_numeric_metadata_missing",
        "field_divisor",
      ].includes(string(data.code));
      let body = `<label>${safeText(entry.summary || label)}${textual && data.code === "malformed_json" ? "<textarea data-fix-text></textarea>" : numeric ? '<input data-fix-text inputmode="decimal">' : "<input data-fix-text>"}</label>`;
      if (sourceLike)
        body = `${selectMarkup("source", "Source", sourceChoices())}${selectMarkup("field", "Field", [])}`;
      if (data.code === "operator")
        body = selectMarkup("choice", "Operator", ["+", "-", "*", "/"]);
      if (data.code === "string_source")
        body = selectMarkup("source", "Source", sourceChoices());
      const fix = openFixShell(
        entry,
        trigger,
        label,
        `${body}${actionRow("Save")}`,
      );
      const sourceSelect = fix.root.querySelector('[data-fix-field="source"]');
      const fieldSelect = fix.root.querySelector('[data-fix-field="field"]');
      if (sourceSelect && fieldSelect)
        sourceSelect.addEventListener("change", () => {
          if (!fieldSelect || fieldSelect.tagName !== "SELECT") return;
          fieldSelect.innerHTML = `<option value="">Choose...</option>${fieldChoices(
            sourceSelect.value,
          )
            .map(
              (name) =>
                `<option value="${safeText(name)}">${safeText(name)}</option>`,
            )
            .join("")}`;
        });
      bindFixSave(fix, () => {
        if (!step) {
          showFixError(fix, "That logic step is no longer on the audit.");
          return false;
        }
        const params = ensureParams(step);
        if (repair === "string-transform") {
          if (data.code === "string_count") {
            const value = fix.root
              .querySelector("[data-fix-text]")
              .value.trim();
            if (!/^[1-9]\d*$/.test(value)) {
              showFixError(fix, "Enter a positive whole number.");
              return false;
            }
            params[data.param] = value;
          } else if (data.code === "string_destination") {
            const value = fix.root
              .querySelector("[data-fix-text]")
              .value.trim();
            if (!value) {
              showFixError(fix, "Enter a destination column.");
              return false;
            }
            params[data.param] = value;
            if (data.param === "column_name") step.field = value;
          } else if (sourceSelect) {
            if (
              !sourceSelect.value ||
              (fieldSelect &&
                !fieldSelect.value &&
                data.code !== "string_source")
            ) {
              showFixError(fix, "Choose a source and field.");
              return false;
            }
            params[`${data.prefix || ""}string_source_file`] =
              sourceSelect.value;
            if (fieldSelect && data.code !== "string_source")
              params[`${data.prefix || ""}string_source_field`] =
                fieldSelect.value;
          }
          commitAudit("String transformation updated.");
          return;
        }
        const operations = array(
          Array.isArray(params[data.param])
            ? params[data.param]
            : (() => {
                try {
                  const parsed = JSON.parse(string(params[data.param] || "[]"));
                  return Array.isArray(parsed) ? parsed : [];
                } catch (_error) {
                  return [];
                }
              })(),
        ).map((item) => ({ ...object(item) }));
        if (data.code === "malformed_json") {
          try {
            const parsed = JSON.parse(
              fix.root.querySelector("[data-fix-text]").value,
            );
            if (!Array.isArray(parsed))
              throw new Error("Math operations must be a JSON array.");
            params[data.param] = parsed;
          } catch (error) {
            showFixError(
              fix,
              string(error.message) || "Enter a JSON array of operations.",
            );
            return false;
          }
          commitAudit("Calculation updated.");
          return;
        }
        const index = Number.isInteger(data.operationIndex)
          ? data.operationIndex
          : 0;
        while (operations.length <= index)
          operations.push({
            operator: "*",
            operandType: "number",
            operand: "",
          });
        const operation = operations[index];
        if (data.code === "operator") {
          operation.operator = fix.root.querySelector(
            '[data-fix-field="choice"]',
          ).value;
          if (!operation.operator) {
            showFixError(fix, "Choose an operator.");
            return false;
          }
        } else if (sourceSelect) {
          if (!sourceSelect.value || (fieldSelect && !fieldSelect.value)) {
            showFixError(fix, "Choose a source and field.");
            return false;
          }
          operation.operandType = "field";
          operation.operandSourceFile = sourceSelect.value;
          operation.operandFieldName = fieldSelect.value;
        } else {
          const value = fix.root.querySelector("[data-fix-text]").value.trim();
          if (
            !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value) ||
            (data.code === "divide_zero" && Number(value) === 0)
          ) {
            showFixError(fix, "Enter a non-zero numeric operand.");
            return false;
          }
          operation.operandType = "number";
          operation.operand = value;
        }
        params[data.param] = operations;
        commitAudit("Calculation updated.");
      });
      return true;
    }
    const sourceMode =
      repair === "logic-reference"
        ? data.referenceKind !== "field"
        : repair === "join-param"
          ? string(data.param).endsWith("_source")
          : repair === "condition-field"
            ? data.referenceKind === "compare-source"
            : repair === "clear-created-ref" && !data.referenceKind
              ? false
              : data.fixKind === "picker";
    const fieldMode =
      !sourceMode ||
      repair === "clear-created-ref" ||
      data.referenceKind === "field" ||
      data.referenceKind === "compare-field" ||
      string(data.param).endsWith("_field");
    const fix = openFixShell(
      entry,
      trigger,
      "Update reference",
      `${sourceMode || fieldMode ? selectMarkup("source", "Source", sourceChoices(), string(data.source)) : ""}${fieldMode ? selectMarkup("field", "Field", fieldChoices(data.source), string(data.fieldName)) : ""}${actionRow("Save reference")}`,
    );
    const sourceSelect = fix.root.querySelector('[data-fix-field="source"]');
    const fieldSelect = fix.root.querySelector('[data-fix-field="field"]');
    if (sourceSelect && fieldSelect)
      sourceSelect.addEventListener("change", () => {
        if (!fieldSelect || fieldSelect.tagName !== "SELECT") return;
        fieldSelect.innerHTML = `<option value="">Choose...</option>${fieldChoices(
          sourceSelect.value,
        )
          .map(
            (name) =>
              `<option value="${safeText(name)}">${safeText(name)}</option>`,
          )
          .join("")}`;
      });
    bindFixSave(fix, () => {
      if (!step && repair !== "logic-reference") {
        showFixError(fix, "That logic step is no longer on the audit.");
        return false;
      }
      const sourceValue = sourceSelect?.value || "";
      const fieldValue = fieldSelect?.value || "";
      if ((sourceSelect && !sourceValue) || (fieldSelect && !fieldValue)) {
        showFixError(fix, "Choose a replacement before saving.");
        return false;
      }
      if (repair === "join-param" && data.param) {
        ensureParams(step)[data.param] = string(data.param).endsWith("_field")
          ? fieldValue
          : sourceValue;
      } else if (repair === "clear-created-ref") {
        if (data.param) {
          const params = ensureParams(step);
          delete params[data.param];
          const valueKey = string(data.param).endsWith("_field_ref")
            ? string(data.param).slice(0, -10)
            : data.param;
          if (fieldValue) params[valueKey] = fieldValue;
        } else if (
          !patchCondition(step, data.conditionId, {
            ...(data.referenceKind === "compare-field"
              ? { compareFieldName: fieldValue, compareFieldRef: null }
              : { fieldName: fieldValue, fieldRef: null }),
          })
        ) {
          showFixError(fix, "That condition is no longer on the step.");
          return false;
        }
      } else if (repair === "condition-field") {
        const patch =
          data.referenceKind === "compare-source"
            ? { compareSourceFile: sourceValue }
            : data.referenceKind === "compare-field"
              ? {
                  compareFieldName: fieldValue,
                  compareSourceFile: sourceValue || undefined,
                }
              : { fieldName: fieldValue, sourceFile: sourceValue || undefined };
        if (!patchCondition(step, data.conditionId, patch)) {
          showFixError(fix, "That condition is no longer on the step.");
          return false;
        }
      } else if (data.location === "step" || !data.conditionId) {
        const params = ensureParams(step);
        if (data.referenceKind === "field") {
          params.field_name = fieldValue;
          step.field = fieldValue;
        } else {
          params.source_file = sourceValue;
          step.source = sourceValue;
        }
      } else {
        const patch =
          data.location === "compare"
            ? data.referenceKind === "field"
              ? { compareFieldName: fieldValue }
              : { compareSourceFile: sourceValue }
            : data.referenceKind === "field"
              ? { fieldName: fieldValue }
              : { sourceFile: sourceValue };
        if (!patchCondition(step, data.conditionId, patch)) {
          showFixError(fix, "That condition is no longer on the step.");
          return false;
        }
      }
      commitAudit("Reference updated.");
    });
    return true;
  }

  const jumpActions = {
    openAuditName(entry) {
      return openOverviewTarget(entry, "#auditName");
    },
    openAuditPurpose(entry) {
      return openOverviewTarget(entry, "#auditPurpose");
    },
    async openAssignmentRole(entry) {
      const role =
        string(entry.target?.field).split(".").pop() ||
        string(entry.instanceId);
      const selector =
        {
          assigned: '[data-open-assignment-picker="assigned"]',
          backup: '[data-open-assignment-picker="backup"]',
          developer: '[data-open-assignment-picker="developer"]',
        }[role] || '[data-open-assignment-picker="assigned"]';
      return openOverviewTarget(entry, selector);
    },
    async openSources(entry) {
      await navigateTo("fields");
      return focusIssueControl(entry, "#sourceFieldSearch");
    },
    async openImport(entry) {
      await navigateTo("fields");
      return focusIssueControl(entry, "#sourceFieldSearch");
    },
    async openSourceReplacement(entry) {
      await navigateTo("fields");
      const sourceKey = string(
        entry.target?.originalSourceKey || entry.target?.sourceKey,
      );
      if (
        typeof global.atlasOpenSourceReplacement === "function" &&
        sourceKey
      ) {
        global.atlasOpenSourceReplacement({
          sourceKey,
          focusField: string(entry.target?.originalField),
        });
        const field = string(entry.target?.originalField);
        const selector = field
          ? `[data-source-replace-field="${cssEscape(field)}"]`
          : ".source-replace-mapping-table";
        const target = await queryVisible(selector, 8);
        if (target) {
          applyIssueHighlight(target, entry.severity);
          return true;
        }
      }
      return focusIssueControl(entry, "#sourceFieldSearch");
    },
    async openLogicTarget(entry) {
      const page = string(entry.target?.page) || "steps";
      await navigateTo(page);
      const fallback =
        page === "fields"
          ? "#sourceFieldSearch"
          : page === "display-fields"
            ? "#addDisplayFieldBtn"
            : page === "overview"
              ? "#auditName"
              : "#addStepBtn, #stepsList";
      return focusIssueControl(entry, fallback);
    },
    async openDisplayFields(entry) {
      await navigateTo("display-fields");
      return focusIssueControl(entry, "#addDisplayFieldBtn");
    },
    async openReadiness(entry) {
      await navigateTo("review");
      return focusIssueControl(entry, "#validationPanel");
    },
    async openSystemIssue(entry) {
      await navigateTo("review");
      return focusIssueControl(entry, "#atlas-readiness-issues-refresh");
    },
  };

  function signatureFor(context) {
    const renderDocument = atlasDisplayDocument?.() || state.audit;
    const renderIdentity = `${string(renderDocument?.id)}:${string(window.ATLASAuditReview?.context?.()?.submittedRevisionId)}`;
    return JSON.stringify({ renderIdentity, context });
  }

  function current() {
    const active =
      typeof hasSelectedAudit === "function"
        ? hasSelectedAudit()
        : Boolean(state?.auditSelected);
    if (!active)
      return Object.freeze({
        status: "ok",
        counts: Object.freeze({ ok: 1, warning: 0, critical: 0, total: 0 }),
        issues: Object.freeze([]),
      });
    if (catalogError) {
      return Object.freeze({
        status: "warning",
        counts: Object.freeze({ ok: 0, warning: 1, critical: 0, total: 1 }),
        issues: Object.freeze([
          {
            ruleId: "system.catalog",
            instanceId: "load",
            stableKey: "system|catalog|load",
            severity: "warning",
            category: "system",
            priority: -1,
            title: "Audit issue rules unavailable",
            summary: "Audit issue rules could not be loaded.",
            detail: string(catalogError.message),
            target: { page: "review", control: "issue-refresh" },
            canJump: true,
            canFix: true,
            jumpAction: "openSystemIssue",
            fixAction: "retryIssueCheck",
            actionData: { fixKind: "retry", control: "issue-refresh" },
          },
        ]),
      });
    }
    if (!catalog || !global.AuditIssueEngine?.create)
      return Object.freeze({
        status: "ok",
        counts: Object.freeze({ ok: 1, warning: 0, critical: 0, total: 0 }),
        issues: Object.freeze([]),
      });
    const signature = auditInputSignature();
    if (cache.result && cache.signature === signature) return cache.result;
    const context = buildContext();
    const engine = global.AuditIssueEngine.create({
      evaluators,
      jumpActions,
      fixActions,
    });
    cache = {
      generation,
      signature,
      result: presentIssues(engine.evaluate(context, catalog.rules)),
    };
    return cache.result;
  }

  function presentIssues(result) {
    const issues = array(result.issues).map((entry) => {
      if (
        entry.category !== "system" ||
        (entry.canJump && entry.canFix && entry.jumpAction && entry.fixAction)
      )
        return entry;
      return {
        ...entry,
        target: {
          page: "review",
          control: "issue-refresh",
          ...object(entry.target),
        },
        canJump: true,
        canFix: true,
        jumpAction: "openSystemIssue",
        fixAction: "retryIssueCheck",
        actionData: {
          fixKind: "retry",
          ruleId: entry.ruleId,
          ...object(entry.actionData),
        },
      };
    });
    if (issues.every((entry, index) => entry === result.issues[index]))
      return result;
    return Object.freeze({
      ...result,
      issues: Object.freeze(issues),
    });
  }

  function auditInputSignature() {
    const active =
      typeof hasSelectedAudit === "function"
        ? hasSelectedAudit()
        : Boolean(state?.auditSelected);
    if (!active) return "inactive";
    const renderDocument = atlasDisplayDocument?.() || state.audit;
    const renderIdentity = `${string(renderDocument?.id)}:${string(window.ATLASAuditReview?.context?.()?.submittedRevisionId)}`;
    return JSON.stringify({
      renderIdentity,
      catalogError: catalogError ? string(catalogError.message) : "",
      catalogReady: Boolean(catalog),
      audit: renderDocument,
      sources: array(global.repoLibraryState?.sourceFiles).map((source) => [
        string(
          source.sourceKey || source.sourceFile || source.alias || source.name,
        ),
        array(source.fields).map((field) =>
          string(
            field.rawFieldName || field.fieldName || field.name || field.label,
          ),
        ),
      ]),
    });
  }

  function invalidate() {
    generation += 1;
    scheduleIssueRender();
    return generation;
  }

  function legacyIssues() {
    return current().issues.map((entry) => ({
      level: entry.severity === "critical" ? "error" : "warn",
      message: entry.summary,
      code: entry.ruleId,
      stepId: entry.target?.stepId || "",
      conditionId: entry.target?.conditionId || "",
    }));
  }

  function loadCatalog() {
    if (catalogPromise) return catalogPromise;
    catalogPromise = (
      typeof global.fetchJsonGracefully === "function"
        ? global.fetchJsonGracefully(CATALOG_URL)
        : fetch(CATALOG_URL).then((response) => {
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return response.json();
          })
    )
      .then((value) => {
        if (!value || !Array.isArray(value.rules))
          throw new Error("Rule catalog is missing a rules array.");
        catalog = value;
        catalogError = null;
        invalidate();
        global.renderValidationPanel?.();
        return value;
      })
      .catch((error) => {
        catalogError = error;
        invalidate();
        global.renderValidationPanel?.();
        return null;
      });
    return catalogPromise;
  }

  let uiBound = false;
  let renderQueued = false;
  let lastFocusedElement = null;
  let renderedAuditKey = "";
  const filters = { severity: "all" };
  const readinessFilters = { severity: "all" };

  function scheduleIssueRender() {
    if (typeof document === "undefined") return;
    if (renderQueued) return;
    renderQueued = true;
    const enqueue =
      global.requestAnimationFrame ||
      (global.setTimeout
        ? (callback) => global.setTimeout(callback, 0)
        : (callback) => callback());
    enqueue(() => {
      renderQueued = false;
      renderIssueSurfaces();
    });
  }

  let cachedUiElements = null;
  function uiElements() {
    if (
      cachedUiElements &&
      (cachedUiElements.root?.isConnected ||
        cachedUiElements.readinessList?.isConnected)
    )
      return cachedUiElements;
    const elements = {
      root: document.getElementById("atlas-audit-issues-root"),
      trigger: document.getElementById("atlas-audit-issues-trigger"),
      panel: document.getElementById("atlas-audit-issues-panel"),
      backdrop: document.getElementById("atlas-audit-issues-backdrop"),
      close: document.getElementById("atlas-audit-issues-close"),
      list: document.getElementById("atlas-audit-issues-list"),
      count: document.getElementById("atlas-audit-issues-count"),
      refresh: document.getElementById("atlas-audit-issues-refresh"),
      readinessSummary: document.getElementById(
        "atlas-readiness-issue-summary",
      ),
      readinessCategories: document.getElementById(
        "atlas-readiness-category-status",
      ),
      readinessFilters: document.querySelector(".readiness-issue-filters"),
      readinessList: document.getElementById("validationPanel"),
      readinessRefresh: document.getElementById(
        "atlas-readiness-issues-refresh",
      ),
    };
    if (elements.root || elements.readinessList) cachedUiElements = elements;
    return elements;
  }

  function stateLabel(result) {
    if (result.status === "critical" || result.counts?.critical)
      return "critical";
    if (result.status === "warning" || result.counts?.warning) return "warning";
    return "ok";
  }

  function summaryText(result) {
    const critical = Number(result.counts?.critical || 0);
    const warning = Number(result.counts?.warning || 0);
    return `${critical} critical, ${warning} warning, ${critical + warning} total issues.`;
  }

  function appendText(element, tag, text, className) {
    const child = document.createElement(tag);
    if (className) child.className = className;
    child.textContent = text;
    element.appendChild(child);
    return child;
  }

  function stepOrderGroup(step) {
    if (!step) return 40;
    if (step.autoGeneratedReference || step.step_type === "reference_source")
      return 10;
    if (step.step_type === "join") return 20;
    if (step.step_type === "create_column") return 30;
    return 40;
  }

  function stepsForIssueLabels() {
    const audit = global.atlasDisplayDocument?.() || state?.audit;
    return array(audit?.steps);
  }

  function compareSiblingSteps(left, right) {
    const leftOrder = Number(left.step.sortOrder);
    const rightOrder = Number(right.step.sortOrder);
    return (
      stepOrderGroup(left.step) - stepOrderGroup(right.step) ||
      (Number.isFinite(leftOrder) ? leftOrder : left.index) -
        (Number.isFinite(rightOrder) ? rightOrder : right.index) ||
      left.index - right.index
    );
  }

  // Every issue card asks for a step number, so the numbering is computed once
  // and reused while each step keeps its identity, position, and order fields.
  const STEP_NUMBER_SNAPSHOT_WIDTH = 6;
  let stepNumberCache = { steps: null, snapshot: [], numbers: new Map() };

  function stepNumberSnapshotMatches(snapshot, steps) {
    if (snapshot.length !== steps.length * STEP_NUMBER_SNAPSHOT_WIDTH)
      return false;
    for (let i = 0, o = 0; i < steps.length; i += 1) {
      const step = steps[i];
      if (
        snapshot[o++] !== step ||
        snapshot[o++] !== step?.id ||
        !Object.is(snapshot[o++], step?.parentId) ||
        !Object.is(snapshot[o++], step?.sortOrder) ||
        snapshot[o++] !== step?.step_type ||
        snapshot[o++] !== step?.autoGeneratedReference
      )
        return false;
    }
    return true;
  }

  function rulesListStepNumbers(steps) {
    if (
      stepNumberCache.steps === steps &&
      stepNumberSnapshotMatches(stepNumberCache.snapshot, steps)
    )
      return stepNumberCache.numbers;
    const snapshot = [];
    const siblings = new Map();
    steps.forEach((step, index) => {
      snapshot.push(
        step,
        step?.id,
        step?.parentId,
        step?.sortOrder,
        step?.step_type,
        step?.autoGeneratedReference,
      );
      const key = step?.parentId || null;
      if (!siblings.has(key)) siblings.set(key, []);
      siblings.get(key).push({ step, index });
    });
    siblings.forEach((items) => items.sort(compareSiblingSteps));
    const numbers = new Map();
    const seen = new Set();
    const visit = (parentId, prefix) => {
      (siblings.get(parentId || null) || []).forEach(({ step }, index) => {
        const stepIdValue = string(step?.id).trim();
        if (!stepIdValue || seen.has(stepIdValue)) return;
        seen.add(stepIdValue);
        const number = [...prefix, index + 1].join(".");
        numbers.set(stepIdValue, number);
        visit(step.id, [...prefix, index + 1]);
      });
    };
    visit(null, []);
    stepNumberCache = { steps, snapshot, numbers };
    return numbers;
  }

  // Read-only copy of the Logic Builder rules-list number (1, 1.1, 2, …).
  function rulesListStepNumber(stepId) {
    const id = string(stepId).trim();
    if (!id) return "";
    const number = rulesListStepNumbers(stepsForIssueLabels()).get(id) || "";
    return number && number !== id ? number : "";
  }

  function issueStepContextLabel(stepId) {
    if (!string(stepId).trim()) return "";
    const number = rulesListStepNumber(stepId);
    return number ? `Step ${number}` : "Step";
  }

  function issueCategories(issues) {
    const workflowOrder = new Map([
      ["audit-setup", 10],
      ["assignments", 20],
      ["sources", 30],
      ["source-replacement", 40],
      ["import", 50],
      ["logic", 60],
      ["hierarchy", 70],
      ["conditions", 80],
      ["actions", 90],
      ["joins", 100],
      ["created-fields", 110],
      ["calculations", 120],
      ["transformations", 130],
      ["display-fields", 140],
      ["system", 150],
    ]);
    return [
      ...new Set(
        issues.map(
          (entry) => string(entry.category || "general").trim() || "general",
        ),
      ),
    ].sort((left, right) => {
      const leftOrder = workflowOrder.get(left);
      const rightOrder = workflowOrder.get(right);
      if (leftOrder != null && rightOrder != null)
        return leftOrder - rightOrder;
      if (leftOrder != null) return 1;
      if (rightOrder != null) return -1;
      return left.localeCompare(right);
    });
  }

  function categoryLabel(category) {
    const labels = {
      "audit-setup": "Audit setup",
      assignments: "Assignments",
      sources: "Sources",
      "source-replacement": "Source replacement",
      import: "Import",
      logic: "Logic",
      hierarchy: "Hierarchy",
      conditions: "Conditions",
      actions: "Actions",
      joins: "Joins",
      "created-fields": "Created fields",
      calculations: "Calculations",
      transformations: "Transformations",
      "display-fields": "Display fields",
      system: "System",
    };
    return (
      labels[category] || category.charAt(0).toUpperCase() + category.slice(1)
    );
  }

  function renderIssueCards(container, result, filterState, includeGroups) {
    if (!container) return;
    container.replaceChildren();
    if (result.error) {
      const message = appendText(
        container,
        "div",
        "Audit issues could not be evaluated. Refresh after the rule catalog and evaluators are available.",
        "atlas-audit-issues__state atlas-audit-issues__state--error",
      );
      message.setAttribute("role", "alert");
      return;
    }
    const issues = array(result.issues).filter(
      (entry) =>
        filterState.severity === "all" ||
        entry.severity === filterState.severity,
    );
    if (!issues.length) {
      appendText(
        container,
        "p",
        array(result.issues).length
          ? "No issues match the selected filters."
          : "No warning or critical audit issues were found.",
        "atlas-audit-issues__state",
      );
      return;
    }
    const groups = includeGroups ? issueCategories(issues) : [""];
    groups.forEach((category) => {
      const group = document.createElement("section");
      group.className = "atlas-audit-issues__group";
      if (includeGroups)
        appendText(
          group,
          "h3",
          categoryLabel(category),
          "atlas-audit-issues__group-title",
        );
      issues
        .filter((entry) => !category || entry.category === category)
        .forEach((entry) => {
          const card = document.createElement("article");
          card.className = `atlas-audit-issue-card atlas-audit-issue-card--${entry.severity}`;
          card.dataset.issueId = string(entry.id || entry.ruleId);
          card.dataset.reviewIssueKey = string(
            entry.stableKey || entry.key || entry.id || entry.ruleId,
          );
          const heading = appendText(
            card,
            "h4",
            string(entry.title || entry.summary || "Audit issue"),
            "atlas-audit-issue-card__title",
          );
          const severity = appendText(
            heading,
            "span",
            string(entry.severity || "warning"),
            "atlas-audit-issue-card__severity",
          );
          severity.setAttribute(
            "aria-label",
            `Severity ${string(entry.severity || "warning")}`,
          );
          appendText(
            card,
            "p",
            string(entry.summary || entry.detail || "Review this audit issue."),
            "atlas-audit-issue-card__summary",
          );
          if (entry.detail && entry.detail !== entry.summary)
            appendText(
              card,
              "p",
              string(entry.detail),
              "atlas-audit-issue-card__detail",
            );
          const context = [
            entry.page || entry.owningPage,
            entry.target?.stepId && issueStepContextLabel(entry.target.stepId),
            entry.target?.conditionId &&
              `Condition ${entry.target.conditionId}`,
          ]
            .filter(Boolean)
            .join(" · ");
          if (context)
            appendText(card, "p", context, "atlas-audit-issue-card__context");
          const actions = document.createElement("div");
          actions.className = "atlas-audit-issue-card__actions";
          if (
            entry.canFix &&
            typeof fixActions[entry.fixAction] === "function"
          ) {
            const fix = appendText(
              actions,
              "button",
              "Fix",
              "btn primary small",
            );
            fix.type = "button";
            fix.dataset.atlasIssueFix = entry.stableKey;
          }
          if (
            entry.canJump &&
            typeof jumpActions[entry.jumpAction] === "function"
          ) {
            const jump = appendText(
              actions,
              "button",
              "Jump to Issue",
              "btn secondary small",
            );
            jump.type = "button";
            jump.dataset.atlasIssueJump = entry.stableKey;
          }
          if (actions.childElementCount) card.appendChild(actions);
          group.appendChild(card);
        });
      container.appendChild(group);
    });
  }

  function updateSeverityButtons(container, filterState, result) {
    if (!container) return;
    const critical = Number(result.counts?.critical || 0);
    const warning = Number(result.counts?.warning || 0);
    const total = critical + warning;
    container
      .querySelectorAll("[data-atlas-issue-severity]")
      .forEach((button) => {
        const severity = button.dataset.atlasIssueSeverity;
        const count =
          severity === "critical"
            ? critical
            : severity === "warning"
              ? warning
              : total;
        const label =
          severity === "critical"
            ? "Critical"
            : severity === "warning"
              ? "Warning"
              : "All";
        button.textContent = `${label} (${count})`;
        const selected = filterState.severity === severity;
        button.classList.toggle("is-active", selected);
        button.setAttribute("aria-pressed", String(selected));
      });
  }

  function renderReviewFeedback(container) {
    if (!container) return;
    container.querySelector?.("[data-review-feedback-projection]")?.remove();
    const feedback = Array.isArray(window.ATLASReviewFeedback)
      ? window.ATLASReviewFeedback
      : [];
    if (!feedback.length) return;
    const section = document.createElement("section");
    section.dataset.reviewFeedbackProjection = "true";
    section.className = "review-feedback-projection";
    section.innerHTML = `<header><h3>Review Feedback</h3><span>${feedback.length}</span></header>${feedback.map((entry) => `<article class="review-feedback-card"><strong>${safeText(entry.displayLabel)}</strong><p>${safeText(entry.decision || (entry.threadState === "Open" ? "Open discussion" : "Feedback"))}</p>${entry.reviewerNote ? `<p>${safeText(entry.reviewerNote)}</p>` : ""}<button type="button" data-review-feedback-target="${safeText(entry.reviewItemId)}">View in context</button></article>`).join("")}`;
    container.append(section);
  }

  const AREA_CONTROLS = {
    "audit-name": "#auditName",
    "audit-purpose": "#auditPurpose",
    "assignment-assigned": '[data-open-assignment-picker="assigned"]',
    "assignment-backup": '[data-open-assignment-picker="backup"]',
    "assignment-developer": '[data-open-assignment-picker="developer"]',
    "source-search": "#sourceFieldSearch",
    "logic-add": "#addStepBtn",
    "display-add": "#addDisplayFieldBtn",
    "issue-refresh":
      "#atlas-readiness-issues-refresh, #atlas-audit-issues-refresh",
    "workbook-import": "#workbookFile, #sourceLibraryImportStatus",
  };

  function isOpenIssue(entry) {
    const severity = string(entry?.severity);
    if (severity !== "warning" && severity !== "critical") return false;
    const status = string(entry?.status || entry?.state)
      .trim()
      .toLowerCase();
    if (status === "closed" || status === "resolved" || status === "dismissed")
      return false;
    if (entry?.resolved === true || entry?.closed === true) return false;
    return true;
  }

  function indicatorTone(issues) {
    const open = array(issues).filter(isOpenIssue);
    if (!open.length) return "";
    return open.some((entry) => entry.severity === "critical")
      ? "critical"
      : "warning";
  }

  // Step surfaces are found with one query per sync. Per-issue selectors scanned
  // the whole document several times for every open step issue.
  const STEP_SURFACE_QUERY =
    ".logic-rule-card[data-id], .step-card[data-id], [data-table-step-id], [data-live-editor-step-id], [data-preview-step-id]";

  function stepSurfaceIds(node) {
    const data = node?.dataset || {};
    const ids = [data.tableStepId, data.liveEditorStepId, data.previewStepId];
    if (data.id && node.matches?.(".logic-rule-card, .step-card"))
      ids.push(data.id);
    return ids.filter(Boolean);
  }

  function indicatorStepId(entry) {
    const target = object(entry?.target);
    return string(target.stepId || entry?.actionData?.stepId).trim();
  }

  // Non-step selectors for an issue; step surfaces come from indicatorStepId.
  function indicatorSelectors(entry) {
    const target = object(entry?.target);
    const control = string(target.control || entry?.actionData?.control);
    const stepId = indicatorStepId(entry);
    const selectors = [];
    if (control === "source-card") {
      const sourceId = string(target.sourceId).trim();
      const sourceName = string(target.sourceName).trim();
      if (sourceId) {
        const id = cssEscape(sourceId);
        selectors.push(
          `#sourcesList [data-id="${id}"]`,
          `.selected-source-compact-card[data-id="${id}"]`,
          `.selected-source-card[data-id="${id}"]`,
        );
      }
      if (sourceName)
        selectors.push(
          `[data-remove-selected-source="${cssEscape(sourceName)}"]`,
        );
    } else if (control === "display-row") {
      const key = string(target.key || entry?.actionData?.key).trim();
      if (key) selectors.push(`[data-display-field-row="${cssEscape(key)}"]`);
    } else if (control === "source-replacement") {
      const field = string(target.originalField).trim();
      const sourceKeys = [target.sourceKey, target.originalSourceKey]
        .map((value) => string(value).trim())
        .filter(Boolean);
      if (field)
        selectors.push(`[data-source-replace-field="${cssEscape(field)}"]`);
      sourceKeys.forEach((key) => {
        const escaped = cssEscape(key);
        selectors.push(
          `[data-review-source-key="${escaped}"]`,
          `[data-remove-selected-source="${escaped}"]`,
        );
      });
      if (!selectors.length) selectors.push(".source-replace-mapping-table");
    } else if (!stepId && AREA_CONTROLS[control])
      selectors.push(AREA_CONTROLS[control]);
    return selectors.filter(Boolean);
  }

  function indicatorHost(node) {
    if (!node || node.nodeType !== 1) return null;
    if (
      node.closest?.(
        "#atlas-audit-issues-panel, .atlas-audit-issue-card, .atlas-issue-indicator",
      )
    )
      return null;
    const climbed = node.closest?.(
      ".logic-rule-card, .step-card, .selected-source-compact-card, .selected-source-card, [data-display-field-row], [data-preview-step-id], [data-table-step-id], [data-live-editor-step-id], [data-source-replace-field], .assignment-columns > div, label",
    );
    let host = climbed || node;
    if (host.tagName === "TR")
      host = host.querySelector(":scope > td, :scope > th") || host;
    if (
      /^(INPUT|SELECT|TEXTAREA)$/.test(host.tagName || "") &&
      host.parentElement &&
      host.parentElement !== document.body
    )
      host = host.parentElement;
    if (!host || host === document.body || host === document.documentElement)
      return null;
    return host;
  }

  function directIndicator(host) {
    if (!host?.querySelectorAll) return null;
    return (
      [...host.querySelectorAll("[data-atlas-issue-indicator]")].find(
        (node) => node.parentElement === host,
      ) || null
    );
  }

  function paintIssueIndicator(host, tone) {
    const label = tone === "critical" ? "Open critical error" : "Open warning";
    host.classList?.add("atlas-issue-indicator-host");
    let marker = directIndicator(host);
    if (!marker) {
      marker = document.createElement("span");
      marker.className = "atlas-issue-indicator";
      marker.setAttribute("role", "img");
      const icon = document.createElement("span");
      icon.className = "atlas-audit-issues__icon";
      icon.setAttribute("aria-hidden", "true");
      marker.append(icon);
      host.append(marker);
    }
    if (
      marker.dataset.atlasIssueIndicator === tone &&
      marker.getAttribute("aria-label") === label
    )
      return;
    marker.dataset.atlasIssueIndicator = tone;
    marker.dataset.status = tone;
    marker.setAttribute("aria-label", label);
    marker.title = label;
  }

  function clearIssueIndicators() {
    if (typeof document === "undefined" || !document.querySelectorAll) return;
    document
      .querySelectorAll("[data-atlas-issue-indicator]")
      .forEach((node) => {
        const host = node.parentElement;
        node.remove?.();
        if (host && !directIndicator(host))
          host.classList?.remove("atlas-issue-indicator-host");
      });
  }

  function syncIssueIndicators(result = current()) {
    if (typeof document === "undefined" || !document.querySelectorAll) return;
    const open = array(result.issues).filter(isOpenIssue);
    const bySelector = new Map();
    const byStepId = new Map();
    const addTo = (map, key, entry) => {
      const list = map.get(key) || [];
      list.push(entry);
      map.set(key, list);
    };
    open.forEach((entry) => {
      const stepId = indicatorStepId(entry);
      if (stepId) addTo(byStepId, stepId, entry);
      indicatorSelectors(entry).forEach((selector) =>
        addTo(bySelector, selector, entry),
      );
    });
    const byHost = new Map();
    const mark = (node, entries) => {
      if (node.hidden || node.type === "hidden") return;
      const host = indicatorHost(node);
      if (!host) return;
      const list = byHost.get(host) || [];
      list.push(...entries);
      byHost.set(host, list);
    };
    if (byStepId.size)
      document.querySelectorAll(STEP_SURFACE_QUERY).forEach((node) => {
        stepSurfaceIds(node).forEach((id) => {
          if (byStepId.has(id)) mark(node, byStepId.get(id));
        });
      });
    bySelector.forEach((entries, selector) => {
      let nodes = [];
      try {
        nodes = [...document.querySelectorAll(selector)];
      } catch {
        nodes = [];
      }
      nodes.forEach((node) => mark(node, entries));
    });
    document
      .querySelectorAll("[data-atlas-issue-indicator]")
      .forEach((node) => {
        const host = node.parentElement;
        if (!host || !byHost.has(host)) {
          node.remove?.();
          if (host && !directIndicator(host))
            host.classList?.remove("atlas-issue-indicator-host");
        }
      });
    byHost.forEach((issues, host) => {
      const tone = indicatorTone(issues);
      if (tone) paintIssueIndicator(host, tone);
    });
  }

  function renderIssueSurfaces() {
    const elements = uiElements();
    if (!elements.root && !elements.readinessList) return;
    if (elements.root) bindIssueUI(elements);
    const active =
      typeof hasSelectedAudit === "function"
        ? hasSelectedAudit()
        : Boolean(state?.auditSelected);
    const activePage =
      document.querySelector(".page.active")?.dataset.page ||
      global.localStorage?.getItem?.("atlasAlignActiveSection") ||
      "my-audits";
    const floatingSurfaceEligible =
      active &&
      [
        "overview",
        "fields",
        "steps",
        "display-fields",
        "preview",
        "review",
        "export",
      ].includes(activePage);
    if (elements.root) elements.root.hidden = !floatingSurfaceEligible;
    if (!floatingSurfaceEligible) closeIssuePanel(false);
    if (!active) {
      closeIssuePanel(false);
      renderReviewFeedback(elements.readinessList);
      if (elements.readinessSummary)
        elements.readinessSummary.textContent =
          "No active audit. Select an audit to review readiness.";
      if (elements.readinessList) elements.readinessList.replaceChildren();
      clearIssueIndicators();
      return;
    }
    renderedAuditKey = currentAuditKey();
    const result = current();
    const status = stateLabel(result);
    if (elements.root) elements.root.dataset.status = status;
    const criticalCount = Number(result.counts?.critical || 0);
    const warningCount = Number(result.counts?.warning || 0);
    const totalCount = criticalCount + warningCount;
    if (elements.count) {
      const showCount = totalCount > 0;
      elements.count.hidden = !showCount;
      elements.count.textContent = showCount ? String(totalCount) : "";
    }
    elements.root
      ?.querySelectorAll("[data-atlas-issue-severity]")
      .forEach((button) => {
        const severity = button.dataset.atlasIssueSeverity;
        const count =
          severity === "critical"
            ? criticalCount
            : severity === "warning"
              ? warningCount
              : totalCount;
        const label =
          severity === "critical"
            ? "Critical"
            : severity === "warning"
              ? "Warning"
              : "All";
        button.textContent = `${label} (${count})`;
        const selected = filters.severity === severity;
        button.classList.toggle("is-active", selected);
        button.setAttribute("aria-pressed", String(selected));
      });
    elements.trigger?.setAttribute(
      "aria-label",
      totalCount > 0 ? `Issues, ${totalCount}` : "Issues",
    );
    renderIssueCards(elements.list, result, filters, true);
    renderReviewFeedback(elements.list);
    if (elements.readinessSummary)
      elements.readinessSummary.textContent = summaryText(result);
    updateSeverityButtons(elements.readinessFilters, readinessFilters, result);
    if (elements.readinessCategories)
      elements.readinessCategories.textContent =
        issueCategories(array(result.issues))
          .map(
            (category) =>
              `${categoryLabel(category)}: ${array(result.issues).filter((entry) => entry.category === category).length}`,
          )
          .join("; ") || "All categories clear.";
    renderIssueCards(elements.readinessList, result, readinessFilters, true);
    // Reuse this render's result: current() serializes the whole audit to check its cache.
    syncIssueIndicators(result);
  }

  function focusableInPanel(panel) {
    return array(
      panel?.querySelectorAll(
        'button:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      ),
    );
  }

  function openIssuePanel() {
    const elements = uiElements();
    if (!elements.panel || !elements.trigger) return;
    lastFocusedElement = document.activeElement;
    elements.panel.hidden = false;
    if (elements.backdrop) elements.backdrop.hidden = false;
    elements.trigger.setAttribute("aria-expanded", "true");
    document.body.classList.add("atlas-audit-issues-open");
    elements.close?.focus();
  }

  function closeIssuePanel(restoreFocus = true) {
    const elements = uiElements();
    if (!elements.panel || elements.panel.hidden) return;
    elements.panel.hidden = true;
    if (elements.backdrop) elements.backdrop.hidden = true;
    elements.trigger?.setAttribute("aria-expanded", "false");
    document.body.classList.remove("atlas-audit-issues-open");
    if (restoreFocus && lastFocusedElement?.isConnected)
      lastFocusedElement.focus();
  }

  function handlePanelKeydown(event) {
    const panel = uiElements().panel;
    if (!panel || panel.hidden) return;
    if (event.key === "Escape") {
      event.preventDefault();
      closeIssuePanel();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = focusableInPanel(panel);
    if (!focusable.length) {
      event.preventDefault();
      panel.focus();
      return;
    }
    const first = focusable[0],
      last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  async function executeFix(stableKey, trigger) {
    if (renderedAuditKey !== currentAuditKey()) {
      status?.(
        "The active audit changed. Audit issues were refreshed before applying the fix.",
        "warn",
      );
      invalidate();
      return false;
    }
    const entry = current().issues.find((item) => item.stableKey === stableKey);
    const action = entry && fixActions[entry.fixAction];
    if (!entry || !entry.canFix || typeof action !== "function") {
      status?.("This audit issue no longer has an available fix.", "warn");
      invalidate();
      return false;
    }
    try {
      const opened = Boolean(await action(entry, trigger));
      if (!opened)
        status?.(
          "The remediation workflow could not be opened. Use Jump to complete the update in the owning page.",
          "warn",
        );
      return opened;
    } catch (error) {
      console.error("ATLAS Audit Issues: fix action failed safely.", {
        ruleId: entry.ruleId,
        message: string(error?.message),
      });
      status?.(
        string(error?.userMessage) ||
          "The remediation workflow could not be opened. Use Jump to complete the update in the owning page.",
        "bad",
      );
      return false;
    }
  }

  async function executeJump(stableKey) {
    if (!stableKey) return false;
    if (!renderedAuditKey || renderedAuditKey !== currentAuditKey()) {
      if (uiElements().summary)
        uiElements().summary.textContent =
          "The active audit changed. Refresh issues before continuing.";
      invalidate();
      return false;
    }
    const entry = current().issues.find((item) => item.stableKey === stableKey);
    const action = entry && jumpActions[entry.jumpAction];
    if (!entry || !entry.canJump || typeof action !== "function") return false;
    closeIssuePanel(false);
    try {
      return Boolean(await action(entry));
    } catch (error) {
      console.error("ATLAS Audit Issues: jump action failed safely.", {
        ruleId: entry.ruleId,
        message: string(error?.message),
      });
      await navigateTo(entry.target?.page || "review");
      return false;
    }
  }

  function bindIssueUI(elements = uiElements()) {
    if (uiBound || !elements.root) return;
    uiBound = true;
    elements.trigger?.addEventListener("click", openIssuePanel);
    elements.close?.addEventListener("click", () => closeIssuePanel());
    elements.backdrop?.addEventListener("click", () => closeIssuePanel());
    elements.panel?.addEventListener("keydown", handlePanelKeydown);
    elements.refresh?.addEventListener("click", invalidate);
    elements.readinessRefresh?.addEventListener("click", invalidate);
    document.addEventListener("input", (event) => {
      // Manual Notes cannot create or clear an issue.
      if (event.target?.matches?.("[data-step-notes-live]")) return;
      invalidate();
    });
    document.addEventListener("change", invalidate);
    document.addEventListener("click", (event) => {
      const fix = event.target.closest("[data-atlas-issue-fix]");
      if (fix) {
        executeFix(fix.dataset.atlasIssueFix, fix);
        return;
      }
      const jump = event.target.closest("[data-atlas-issue-jump]");
      if (jump) {
        executeJump(jump.dataset.atlasIssueJump);
        return;
      }
      const button = event.target.closest("[data-atlas-issue-severity]");
      if (!button) return;
      const filterState =
        button.dataset.atlasIssueSurface === "readiness"
          ? readinessFilters
          : filters;
      filterState.severity = button.dataset.atlasIssueSeverity;
      scheduleIssueRender();
    });
  }

  global.ATLASAuditIssues = Object.freeze({
    buildContext,
    current,
    invalidate,
    legacyIssues,
    loadCatalog,
    catalogReady: loadCatalog(),
    render: scheduleIssueRender,
    jumpToIssue: executeJump,
    fixIssue: executeFix,
    indicatorTone,
    syncIndicators: () => syncIssueIndicators(),
  });
  global.atlasMarkLogicIssuesDirty = invalidate;
  global.atlasLogicIssues = () => current().issues;
  scheduleIssueRender();
})(window);
if (typeof document !== "undefined") {
  document.addEventListener("click", (event) => {
    const target = event.target.closest?.("[data-review-feedback-target]");
    if (target)
      window.ATLASAuditReview?.navigate?.(target.dataset.reviewFeedbackTarget);
  });
  const watchIssueIndicators = () => {
    if (
      !document.body ||
      document.body.dataset.atlasIssueIndicatorObserver === "true" ||
      typeof MutationObserver !== "function"
    )
      return;
    document.body.dataset.atlasIssueIndicatorObserver = "true";
    let frame = 0;
    const observer = new MutationObserver(() => {
      if (frame) return;
      const schedule =
        window.requestAnimationFrame ||
        ((callback) => window.setTimeout(callback, 16));
      frame = schedule(() => {
        frame = 0;
        window.ATLASAuditIssues?.syncIndicators?.();
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
  };
  if (document.body) watchIssueIndicators();
  else
    document.addEventListener("DOMContentLoaded", watchIssueIndicators, {
      once: true,
    });
}
