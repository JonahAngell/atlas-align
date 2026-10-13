/**
 * Portable, persistence-free Audit Issue engine.
 *
 * The engine evaluates declarative rules against caller-owned context. It has
 * no ATLAS state, DOM, navigation, persistence, API, database, or rendering
 * dependency. Applications provide named evaluator/action registries.
 *
 * Classic-script usage:
 *   const engine = AuditIssueEngine.create({ evaluators: { requiredValue } });
 *   const result = engine.evaluate(context, rules);
 */
(function initializeAuditIssueEngine(global) {
  "use strict";

  const SEVERITIES = Object.freeze(["ok", "warning", "critical"]);
  const SEVERITY_RANK = Object.freeze({ ok: 0, warning: 1, critical: 2 });
  const SYSTEM_CATEGORY = "system";

  function isPlainObject(value) {
    if (!value || typeof value !== "object" || Array.isArray(value))
      return false;
    const prototype = Object.getPrototypeOf(value);
    return (
      prototype === null ||
      Object.prototype.toString.call(value) === "[object Object]"
    );
  }

  function text(value, fallback = "") {
    return value == null ? fallback : String(value);
  }

  function nonBlank(value, fallback = "") {
    const normalized = text(value).trim();
    return normalized || text(fallback).trim();
  }

  function clone(value, seen = new WeakMap()) {
    if (value == null || typeof value !== "object") return value;
    if (seen.has(value)) return seen.get(value);
    if (Array.isArray(value)) {
      const result = [];
      seen.set(value, result);
      value.forEach((item) => result.push(clone(item, seen)));
      return result;
    }
    const result = {};
    seen.set(value, result);
    Object.entries(value).forEach(([key, item]) => {
      result[key] = clone(item, seen);
    });
    return result;
  }

  function deepFreeze(value, seen = new WeakSet()) {
    if (!value || typeof value !== "object" || seen.has(value)) return value;
    seen.add(value);
    Object.values(value).forEach((item) => deepFreeze(item, seen));
    return Object.freeze(value);
  }

  function registry(value, label) {
    if (value == null) return Object.freeze({});
    if (!isPlainObject(value))
      throw new TypeError(`${label} must be an object.`);
    const copy = {};
    Object.entries(value).forEach(([name, handler]) => {
      if (!nonBlank(name) || typeof handler !== "function")
        throw new TypeError(`${label} entries must be named functions.`);
      copy[name] = handler;
    });
    return Object.freeze(copy);
  }

  function ruleError(index, message) {
    return `Rule ${index + 1}: ${message}`;
  }

  function validateRules(rules, registries = {}) {
    if (!Array.isArray(rules))
      return Object.freeze({
        valid: false,
        errors: Object.freeze(["Rules must be an array."]),
        rules: Object.freeze([]),
      });

    const evaluators = registries.evaluators || {};
    const jumpActions = registries.jumpActions || {};
    const fixActions = registries.fixActions || {};
    const errors = [];
    const ids = new Set();
    const normalized = [];

    rules.forEach((input, index) => {
      if (!isPlainObject(input)) {
        errors.push(ruleError(index, "must be an object."));
        return;
      }
      const id = nonBlank(input.id);
      if (!id) errors.push(ruleError(index, "id is required."));
      else if (ids.has(id))
        errors.push(ruleError(index, `duplicate id "${id}".`));
      else ids.add(id);

      if (typeof input.enabled !== "boolean")
        errors.push(ruleError(index, "enabled must be a boolean."));
      const severity = nonBlank(input.severity);
      if (!SEVERITIES.includes(severity))
        errors.push(ruleError(index, `unsupported severity "${severity}".`));
      const category = nonBlank(input.category);
      if (!category) errors.push(ruleError(index, "category is required."));
      const evaluator = nonBlank(input.evaluator);
      if (!evaluator) errors.push(ruleError(index, "evaluator is required."));
      else if (typeof evaluators[evaluator] !== "function")
        errors.push(ruleError(index, `unknown evaluator "${evaluator}".`));
      const jumpAction = nonBlank(input.jumpAction);
      if (jumpAction && typeof jumpActions[jumpAction] !== "function")
        errors.push(ruleError(index, `unknown jump action "${jumpAction}".`));
      const fixAction = nonBlank(input.fixAction);
      if (fixAction && typeof fixActions[fixAction] !== "function")
        errors.push(ruleError(index, `unknown fix action "${fixAction}".`));
      const priority = input.priority == null ? 100 : Number(input.priority);
      if (!Number.isFinite(priority))
        errors.push(ruleError(index, "priority must be a finite number."));
      if (!nonBlank(input.title))
        errors.push(ruleError(index, "title is required."));
      if (!nonBlank(input.summary))
        errors.push(ruleError(index, "summary is required."));
      if (input.config != null && !isPlainObject(input.config))
        errors.push(
          ruleError(index, "config must be an object when supplied."),
        );

      normalized.push({
        id,
        enabled: input.enabled,
        severity,
        category,
        priority: Number.isFinite(priority) ? priority : 100,
        title: text(input.title),
        summary: text(input.summary),
        detail: text(input.detail),
        evaluator,
        jumpAction,
        fixAction,
        targetType: nonBlank(input.targetType),
        config: clone(input.config || {}),
        documentation: text(input.documentation),
      });
    });

    return deepFreeze({
      valid: errors.length === 0,
      errors,
      rules: normalized,
    });
  }

  function targetDescriptor(value) {
    return isPlainObject(value) ? clone(value) : {};
  }

  function stableTarget(target) {
    return [
      target.page,
      target.stepId,
      target.conditionId,
      target.field,
      target.control,
    ]
      .map((value) => nonBlank(value))
      .join("|");
  }

  function normalizeIssue(rule, input, index) {
    const candidate = isPlainObject(input) ? input : { summary: text(input) };
    const target = targetDescriptor(candidate.target);
    const severity = SEVERITIES.includes(candidate.severity)
      ? candidate.severity
      : rule.severity;
    const instanceId = nonBlank(candidate.instanceId, String(index + 1));
    const stableKey = nonBlank(
      candidate.stableKey,
      `${rule.id}|${instanceId}|${stableTarget(target)}`,
    );
    return {
      ruleId: rule.id,
      instanceId,
      stableKey,
      severity,
      category: nonBlank(candidate.category, rule.category),
      priority: Number.isFinite(Number(candidate.priority))
        ? Number(candidate.priority)
        : rule.priority,
      title: text(candidate.title, rule.title),
      summary: text(candidate.summary, rule.summary),
      detail: text(candidate.detail, rule.detail),
      target,
      canJump: Boolean(rule.jumpAction && candidate.canJump !== false),
      canFix: Boolean(rule.fixAction && candidate.canFix !== false),
      jumpAction: rule.jumpAction || null,
      fixAction: rule.fixAction || null,
      actionData: isPlainObject(candidate.actionData)
        ? clone(candidate.actionData)
        : {},
    };
  }

  function evaluatorOutput(value) {
    if (value == null || value === false) return [];
    if (value === true) return [{}];
    return Array.isArray(value) ? value : [value];
  }

  function systemIssue(rule, error) {
    return {
      ruleId: rule.id,
      instanceId: "evaluator-error",
      stableKey: `system|${rule.id}|evaluator-error`,
      severity: "warning",
      category: SYSTEM_CATEGORY,
      priority: -1,
      title: "Issue check could not be completed",
      summary: `The ${rule.title} check could not be completed.`,
      detail: nonBlank(error && error.message, "Evaluator failed."),
      target: {},
      canJump: false,
      canFix: false,
      jumpAction: null,
      fixAction: null,
      actionData: {},
    };
  }

  function compareIssues(a, b) {
    return (
      SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] ||
      a.priority - b.priority ||
      a.category.localeCompare(b.category) ||
      a.title.localeCompare(b.title) ||
      stableTarget(a.target).localeCompare(stableTarget(b.target)) ||
      a.stableKey.localeCompare(b.stableKey)
    );
  }

  function aggregate(issues) {
    const counts = { ok: 0, warning: 0, critical: 0, total: issues.length };
    issues.forEach((issue) => {
      if (issue.severity === "critical") counts.critical += 1;
      else if (issue.severity === "warning") counts.warning += 1;
    });
    const status = counts.critical
      ? "critical"
      : counts.warning
        ? "warning"
        : "ok";
    counts.ok = status === "ok" ? 1 : 0;
    return deepFreeze({ status, counts });
  }

  function create(options = {}) {
    if (!isPlainObject(options))
      throw new TypeError("Engine options must be an object.");
    const registries = Object.freeze({
      evaluators: registry(options.evaluators, "evaluators"),
      jumpActions: registry(options.jumpActions, "jumpActions"),
      fixActions: registry(options.fixActions, "fixActions"),
    });

    function validate(ruleDefinitions) {
      return validateRules(ruleDefinitions, registries);
    }

    function evaluate(context, ruleDefinitions) {
      const validation = validate(ruleDefinitions);
      if (!validation.valid) {
        const error = new TypeError(
          `Invalid issue rules: ${validation.errors.join(" ")}`,
        );
        error.validationErrors = [...validation.errors];
        throw error;
      }
      const safeContext = deepFreeze(clone(context));
      const collected = [];
      validation.rules
        .filter((rule) => rule.enabled)
        .forEach((rule) => {
          try {
            const output = registries.evaluators[rule.evaluator](
              safeContext,
              deepFreeze(clone(rule.config)),
              rule,
            );
            evaluatorOutput(output).forEach((item, index) =>
              collected.push(normalizeIssue(rule, item, index)),
            );
          } catch (error) {
            collected.push(systemIssue(rule, error));
          }
        });
      const unique = new Map();
      collected.forEach((issue) => {
        if (!unique.has(issue.stableKey)) unique.set(issue.stableKey, issue);
      });
      const issues = [...unique.values()]
        .sort(compareIssues)
        .map((issue) => deepFreeze(issue));
      return deepFreeze({ issues, ...aggregate(issues) });
    }

    return Object.freeze({
      evaluate,
      validateRules: validate,
      aggregate,
      severities: SEVERITIES,
    });
  }

  if (!global.AuditIssueEngine)
    global.AuditIssueEngine = Object.freeze({
      create,
      validateRules,
      severities: SEVERITIES,
    });
})(typeof window !== "undefined" ? window : globalThis);
