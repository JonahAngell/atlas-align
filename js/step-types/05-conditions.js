/**
 * Step type conditions: the condition tree of an IF / THEN style step as
 * plain data, and the structure rules that lay a tree out as text.
 *
 * A step stores its conditions as JSON in params.conditions_json (or, in
 * older audits, as step.conditions). Each node is a single condition or a
 * group ({conditionType: "group", connector, groupConnector, items}). These
 * functions read that tree; they never write the step. How a single
 * condition reads is not decided here: every layout takes a `leaf` callback,
 * so templates (through the conditionTree helper) and the app code render
 * the same structure.
 *
 * Classic-script usage:
 *   const { conditions } = ATLASStepTypes;
 *   const tree = conditions.normalizedTree(step);
 *   conditions.bullets(tree, { leaf, line });
 */
(function initializeStepTypeConditions(global) {
  "use strict";

  /** Run parameters a condition can compare with: [value, label, help]. */
  const RUN_PARAMETERS = Object.freeze([
    Object.freeze(["runDate", "Run Date", "The date the audit is run."]),
  ]);
  /** Operators a run parameter can be compared with. */
  const PARAMETER_OPERATORS = Object.freeze([
    "is equal to",
    "is not equal to",
    "is greater than",
    "is greater than or equal to",
    "is less than",
    "is less than or equal to",
  ]);
  /** Text the current compiler reads as the run date (see RUN_TOKENS). */
  const RUN_PARAMETER_MIRROR = Object.freeze({ runDate: "run date" });

  const isGroup = (node) => !!node && node.conditionType === "group";

  /** AND or OR; anything else becomes `fallback`. */
  function connectorOf(value, fallback = "AND") {
    const normalized = String(value || "")
      .trim()
      .toUpperCase();
    return normalized === "OR" || normalized === "AND" ? normalized : fallback;
  }

  const groupItems = (group) =>
    Array.isArray(group?.items) ? group.items : [];

  /** Every single condition in a tree, depth first. */
  function leaves(nodes) {
    const found = [];
    const visit = (list) =>
      (Array.isArray(list) ? list : []).forEach((node) => {
        if (isGroup(node)) visit(groupItems(node));
        else if (node) found.push(node);
      });
    visit(nodes);
    return found;
  }

  /** Rebuilds a tree with leaf(node, index, depth) applied to each leaf. */
  function mapLeaves(nodes, leaf, depth = 0) {
    return (Array.isArray(nodes) ? nodes : []).map((node, index) =>
      isGroup(node)
        ? { ...node, items: mapLeaves(groupItems(node), leaf, depth + 1) }
        : leaf(node, index, depth),
    );
  }

  /** Replaces a group of one item with that item, at every level. */
  function collapseSingleGroups(nodes) {
    return (Array.isArray(nodes) ? nodes : []).map((node) => {
      if (!isGroup(node)) return node;
      const items = collapseSingleGroups(groupItems(node));
      if (items.length === 1) return { ...items[0], connector: node.connector };
      return { ...node, items };
    });
  }

  /**
   * The stored condition tree of a step: params.conditions_json when it is a
   * list, else the legacy step.conditions read as guided conditions. `uid`
   * and `sourceAliasFor` come from the app; without them legacy conditions
   * get no id and the source as their alias.
   */
  function parse(step, options = {}) {
    const params = step?.params || {};
    if (params.conditions_json) {
      try {
        const parsed = JSON.parse(params.conditions_json);
        if (Array.isArray(parsed)) return parsed;
      } catch {
        // Not JSON: fall back to the legacy conditions.
      }
    }
    const uid = typeof options.uid === "function" ? options.uid : () => "";
    const aliasFor =
      typeof options.sourceAliasFor === "function"
        ? options.sourceAliasFor
        : (value) => value;
    return (Array.isArray(step?.conditions) ? step.conditions : []).map(
      (condition, index) => ({
        id: condition.id || uid("cond"),
        connector: index === 0 ? "IF" : condition.connector || "AND",
        sourceFile:
          condition.sourceFile || step.source || params.source_file || "",
        sourceAlias:
          condition.sourceAlias ||
          params.source_alias ||
          aliasFor(
            condition.sourceFile || step.source || params.source_file || "",
          ),
        fieldName:
          condition.fieldName || condition.field || params.field_name || "",
        operator: condition.operator || params.operator || "is equal to",
        valueMode: condition.valueMode || "values",
        compareValue:
          condition.compareValue ||
          condition.value ||
          params.compare_value ||
          "",
        compareSourceFile: condition.compareSourceFile || "",
        compareSourceAlias: condition.compareSourceAlias || "",
        compareFieldName: condition.compareFieldName || "",
        expression: condition.expression || "",
        compareMathJson:
          condition.compareMathJson || condition.compare_math_json || "",
      }),
    );
  }

  /** The value mode shown in the editor; a run parameter is stored as values. */
  function uiValueMode(condition = {}) {
    const mode = condition.valueMode || "values";
    if (mode === "parameter") return "parameter";
    if (mode === "values" && condition.compareParameter) return "parameter";
    return mode;
  }

  /** A stored value list as an array, one value per line. */
  function valueArray(condition = {}) {
    if (Array.isArray(condition.compareValues))
      return condition.compareValues
        .map((value) => String(value ?? "").trim())
        .filter(Boolean);
    return String(condition.compareValue ?? "")
      .split(/\r?\n/)
      .map((value) => value.trim())
      .filter(Boolean);
  }

  /**
   * One condition in its normalized form (a copy).
   * - A run parameter is stored as valueMode "values" plus compareParameter.
   *   compareValue mirrors it as "run date", which the current compiler reads
   *   as the run date. With an operator it cannot use, the mirror is blank so
   *   the current compiler blocks the condition.
   * - A value list is kept in compareValues (an array) and in compareValue
   *   (one value per line), which the current compiler reads.
   */
  function normalizeLeaf(condition = {}) {
    const next = { ...condition };
    if (uiValueMode(next) === "parameter") {
      const parameter = RUN_PARAMETERS.some(
        ([value]) => value === next.compareParameter,
      )
        ? next.compareParameter
        : "runDate";
      next.valueMode = "values";
      next.compareParameter = parameter;
      next.compareValue = PARAMETER_OPERATORS.includes(next.operator)
        ? RUN_PARAMETER_MIRROR[parameter]
        : "";
      delete next.compareValues;
      return next;
    }
    delete next.compareParameter;
    if ((next.valueMode || "values") === "values") {
      const values = valueArray(next);
      next.compareValues = values;
      next.compareValue = values.join("\n");
    } else delete next.compareValues;
    return next;
  }

  /** The step's tree with every single condition normalized. */
  function normalizedTree(step, options = {}) {
    return mapLeaves(parse(step, options), (node) => normalizeLeaf(node));
  }

  // ---------------------------------------------------------------------------
  // Layouts. Each takes the tree and a leaf(condition) callback that returns
  // the text of one condition.
  // ---------------------------------------------------------------------------

  /**
   * Analyst text. Top-level nodes read inline, each through
   * line(connector, text). A group that follows a condition belongs to it:
   * that condition's line ends with "AND:"/"OR:" and the group's items follow
   * as indented bullets, each ending with the group's connector except the
   * last. A group with no condition before it opens with allOf / anyOf
   * ("ALL OF:" / "ANY OF:").
   */
  function bullets(nodes, options = {}) {
    const leaf = options.leaf || (() => "");
    const line =
      options.line || ((connector, text) => `${connector} ${text}`.trim());
    const allOf = options.allOf ?? "ALL OF:";
    const anyOf = options.anyOf ?? "ANY OF:";
    const bulletLines = (group, depth) => {
      const items = groupItems(group);
      const inner = connectorOf(group.groupConnector, "OR");
      const lines = [];
      items.forEach((item, index) => {
        const indent = "  ".repeat(depth);
        const trailing = index < items.length - 1 ? ` ${inner}` : "";
        if (!isGroup(item)) {
          lines.push(`${indent}• ${leaf(item)}${trailing}`);
          return;
        }
        const previous = items[index - 1];
        if (previous && !isGroup(previous) && lines.length)
          lines[lines.length - 1] += ":";
        else
          lines.push(
            `${indent}• ${
              connectorOf(item.groupConnector, "OR") === "AND" ? allOf : anyOf
            }`,
          );
        const nested = bulletLines(item, depth + 1);
        if (trailing && nested.length) nested[nested.length - 1] += trailing;
        lines.push(...nested);
      });
      return lines;
    };
    let text = "";
    collapseSingleGroups(nodes).forEach((node, index) => {
      const connector = index === 0 ? "IF" : connectorOf(node.connector);
      if (isGroup(node)) {
        text += `${text && !text.endsWith("\n") ? " " : ""}${connector}:\n${bulletLines(node, 1).join("\n")}\n`;
        return;
      }
      text += `${text && !text.endsWith("\n") ? " " : ""}${line(connector, leaf(node))}`;
    });
    return text.replace(/\n+$/, "").trim();
  }

  /**
   * One expression, wrapping each group of two or more items in
   * parentheses, e.g. IF a AND (b OR c OR (d AND e)).
   */
  function inline(nodes, options = {}) {
    const leaf = options.leaf || (() => "");
    const groupText = (group) => {
      const inner = connectorOf(group.groupConnector, "OR");
      return `(${groupItems(group)
        .map((item) => (isGroup(item) ? groupText(item) : leaf(item)))
        .join(` ${inner} `)})`;
    };
    return collapseSingleGroups(nodes)
      .map((node, index) => {
        const connector = index === 0 ? "IF" : connectorOf(node.connector);
        return `${connector} ${isGroup(node) ? groupText(node) : leaf(node)}`;
      })
      .join(" ");
  }

  /**
   * One boolean expression for a formula. Groups use their own connector;
   * top-level connectors follow SQL precedence (AND before OR).
   * combine(expressions, "AND" | "OR") joins a list in the formula's dialect;
   * blank expressions are left out. Returns "" for an empty tree.
   */
  function precedence(nodes, options = {}) {
    const leaf = options.leaf || (() => "");
    const combine =
      options.combine ||
      ((items, connector) => items.filter(Boolean).join(` ${connector} `));
    const nodeExpression = (node) => {
      if (!isGroup(node)) return leaf(node);
      return combine(
        groupItems(node).map(nodeExpression),
        connectorOf(node.groupConnector, "OR"),
      );
    };
    const list = Array.isArray(nodes) ? nodes : [];
    const orRuns = [];
    list.forEach((node, index) => {
      const expression = nodeExpression(node);
      if (!expression) return;
      if (!orRuns.length || (index > 0 && connectorOf(node.connector) === "OR"))
        orRuns.push([expression]);
      else orRuns[orRuns.length - 1].push(expression);
    });
    return combine(
      orRuns.map((run) => combine(run, "AND")),
      "OR",
    );
  }

  const STYLES = Object.freeze(["bullets", "inline", "precedence"]);

  const api = Object.freeze({
    RUN_PARAMETERS,
    PARAMETER_OPERATORS,
    RUN_PARAMETER_MIRROR,
    STYLES,
    isGroup,
    connectorOf,
    groupItems,
    leaves,
    mapLeaves,
    collapseSingleGroups,
    parse,
    uiValueMode,
    valueArray,
    normalizeLeaf,
    normalizedTree,
    bullets,
    inline,
    precedence,
  });
  global.ATLASStepTypes = global.ATLASStepTypes || {};
  global.ATLASStepTypes.conditions = api;
})(typeof window !== "undefined" ? window : globalThis);
