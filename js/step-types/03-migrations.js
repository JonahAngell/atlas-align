/**
 * Step migrations: declarative rules that bring older saved steps up to the
 * current shape of their step type.
 *
 * Each definition lists `aliases` (older step_type and type names) and
 * `migrations` (ordered rules). Every audit load and import can run them. The
 * runner never mutates its input and never runs template text as code.
 *
 * Rules (each may have a `when` condition):
 *   { op: "setStepType", to }               move the step to another type and
 *                                           continue with that type's rules
 *   { op: "default", param, value | valueFrom | template }   fill when blank
 *   { op: "set", param, value | valueFrom | template }       always write
 *   { op: "rename", from, to }              move a parameter (keeps `to` if set)
 *   { op: "remove", param }
 *   { op: "mapValue", param, map }          rewrite stored values
 *   { op: "handler", name }                 a named code handler for rewrites
 *                                           no rule can express
 * `valueFrom` lists "param.x" / "step.x" paths; the first non-blank one wins.
 *
 * Classic-script usage:
 *   const { step, definition, changes } =
 *     ATLASStepTypes.migrations.migrateStep(saved, registry, { helpers });
 */
(function initializeStepTypeMigrations(global) {
  "use strict";

  const MAX_TYPE_CHANGES = 5;

  const clone = (value) =>
    value === undefined ? undefined : JSON.parse(JSON.stringify(value));

  const own = (target, key) =>
    target && Object.prototype.hasOwnProperty.call(target, key)
      ? target[key]
      : undefined;

  function readPath(step, path) {
    const [root, key] = path.split(".");
    return root === "param" ? own(step.params, key) : own(step, key);
  }

  function valueFor(rule, step, options) {
    const { isBlank } = global.ATLASStepTypes.definitions;
    if (rule.value !== undefined) return clone(rule.value);
    if (rule.valueFrom) {
      const found = rule.valueFrom
        .map((path) => readPath(step, path))
        .find((value) => !isBlank(value));
      return found === undefined ? "" : clone(found);
    }
    return global.ATLASStepTypes.templates.render(
      rule.template,
      { param: step.params, step },
      { helpers: options.helpers, format: "migration" },
    );
  }

  /**
   * Migrates one saved step. Returns
   *   { step, definition, changes, errors, known }
   * where `known` is false when no definition claims the step (it is then
   * returned unchanged apart from a params object).
   * Options: helpers (template helpers), handlers ({ name: (step, info) => void }),
   * fallbackStepType (used when the step names no type), syncLegacyType
   * (default true: write the definition's legacyType to step.type).
   */
  function migrateStep(input, registry, options = {}) {
    const { matches, isBlank } = global.ATLASStepTypes.definitions;
    const step = clone(input) || {};
    step.params =
      step.params &&
      typeof step.params === "object" &&
      !Array.isArray(step.params)
        ? step.params
        : {};
    const changes = [];
    const errors = [];
    let definition = registry.resolve(step.step_type, step.type);
    if (
      !definition &&
      isBlank(step.step_type) &&
      isBlank(step.type) &&
      options.fallbackStepType
    )
      definition = registry.resolve(options.fallbackStepType);
    if (!definition)
      return { step, definition: null, changes, errors, known: false };

    if (step.step_type !== definition.id) {
      changes.push({
        op: "alias",
        from: step.step_type || step.type || "",
        to: definition.id,
      });
      step.step_type = definition.id;
    }

    const visited = [definition.id];
    let rules = definition.migrations || [];
    for (let index = 0; index < rules.length; index += 1) {
      const rule = rules[index];
      if (rule.when && !matches(rule.when, step)) continue;
      const params = step.params;
      if (rule.op === "setStepType") {
        const target = registry.resolve(rule.to);
        if (!target) {
          errors.push({
            op: rule.op,
            message: `step type "${rule.to}" is not registered`,
          });
          continue;
        }
        if (visited.length > MAX_TYPE_CHANGES || visited.includes(target.id)) {
          errors.push({
            op: rule.op,
            message: `step type changes loop at "${target.id}"`,
          });
          break;
        }
        changes.push({ op: rule.op, from: definition.id, to: target.id });
        visited.push(target.id);
        definition = target;
        step.step_type = target.id;
        rules = target.migrations || [];
        index = -1;
        continue;
      }
      if (
        rule.op === "set" ||
        (rule.op === "default" && isBlank(own(params, rule.param)))
      ) {
        // A template that cannot render leaves the parameter as it was, so a
        // broken definition never stops an audit from loading.
        try {
          params[rule.param] = valueFor(rule, step, options);
          changes.push({ op: rule.op, param: rule.param });
        } catch (error) {
          errors.push({
            op: rule.op,
            param: rule.param,
            message: error.message,
          });
        }
      } else if (rule.op === "rename") {
        if (Object.prototype.hasOwnProperty.call(params, rule.from)) {
          if (isBlank(own(params, rule.to)))
            params[rule.to] = params[rule.from];
          delete params[rule.from];
          changes.push({ op: rule.op, from: rule.from, to: rule.to });
        }
      } else if (rule.op === "remove") {
        if (Object.prototype.hasOwnProperty.call(params, rule.param)) {
          delete params[rule.param];
          changes.push({ op: rule.op, param: rule.param });
        }
      } else if (rule.op === "mapValue") {
        const current = own(params, rule.param);
        const key = current == null ? "" : String(current);
        if (Object.prototype.hasOwnProperty.call(rule.map, key)) {
          params[rule.param] = rule.map[key];
          changes.push({ op: rule.op, param: rule.param });
        }
      } else if (rule.op === "handler") {
        const handler = own(options.handlers || {}, rule.name);
        if (typeof handler !== "function") {
          errors.push({
            op: rule.op,
            message: `migration handler "${rule.name}" is not registered`,
          });
          continue;
        }
        handler(step, { definition, params: step.params });
        changes.push({ op: rule.op, name: rule.name });
      }
    }
    if (options.syncLegacyType !== false && definition.legacyType)
      step.type = definition.legacyType;
    return { step, definition, changes, errors, known: true };
  }

  const api = Object.freeze({ migrateStep });
  global.ATLASStepTypes = global.ATLASStepTypes || {};
  global.ATLASStepTypes.migrations = api;
})(typeof window !== "undefined" ? window : globalThis);
