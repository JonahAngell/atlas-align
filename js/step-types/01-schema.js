/**
 * A small JSON Schema validator for step type definitions.
 *
 * It supports the subset of JSON Schema (2020-12) that
 * catalogs/step-types/schema.json uses, and refuses any other keyword so the
 * schema can never silently stop being enforced. The same code runs in the
 * browser, in the builder and on the server.
 *
 * Classic-script usage:
 *   const errors = ATLASStepTypes.schema.validate(schema, value);
 *   // [{ path: "/fields/0/param", message: "is required" }]
 */
(function initializeStepTypeSchema(global) {
  "use strict";

  const ANNOTATIONS = new Set([
    "$schema",
    "$id",
    "$comment",
    "title",
    "description",
    "default",
    "examples",
  ]);
  const KEYWORDS = new Set([
    ...ANNOTATIONS,
    "$defs",
    "$ref",
    "type",
    "enum",
    "const",
    "properties",
    "required",
    "additionalProperties",
    "propertyNames",
    "items",
    "minItems",
    "maxItems",
    "uniqueItems",
    "minLength",
    "maxLength",
    "pattern",
    "minimum",
    "maximum",
    "minProperties",
    "maxProperties",
    "anyOf",
    "oneOf",
    "not",
  ]);
  const MAX_ERRORS = 100;

  function typeOf(value) {
    if (value === null) return "null";
    if (Array.isArray(value)) return "array";
    if (typeof value === "number")
      return Number.isInteger(value) ? "integer" : "number";
    return typeof value;
  }

  function matchesType(value, type) {
    const actual = typeOf(value);
    return actual === type || (type === "number" && actual === "integer");
  }

  function pointer(path, key) {
    return `${path}/${String(key).replace(/~/g, "~0").replace(/\//g, "~1")}`;
  }

  function sameValue(left, right) {
    return JSON.stringify(left) === JSON.stringify(right);
  }

  /** Throws when the schema uses a keyword this validator does not enforce. */
  function assertSupported(schema, path = "#") {
    if (typeof schema === "boolean") return;
    if (!schema || typeof schema !== "object" || Array.isArray(schema))
      throw new Error(`Schema at ${path} must be an object`);
    Object.keys(schema).forEach((key) => {
      if (!KEYWORDS.has(key))
        throw new Error(`Schema keyword "${key}" at ${path} is not supported`);
    });
    const nested = (value, where) => assertSupported(value, where);
    Object.entries(schema.$defs || {}).forEach(([key, value]) =>
      nested(value, `${path}/$defs/${key}`),
    );
    Object.entries(schema.properties || {}).forEach(([key, value]) =>
      nested(value, `${path}/properties/${key}`),
    );
    ["additionalProperties", "items", "not", "propertyNames"].forEach((key) => {
      if (schema[key] !== undefined) nested(schema[key], `${path}/${key}`);
    });
    ["anyOf", "oneOf"].forEach((key) =>
      (schema[key] || []).forEach((value, index) =>
        nested(value, `${path}/${key}/${index}`),
      ),
    );
  }

  function resolveRef(root, ref) {
    const match = /^#\/\$defs\/([\w-]+)$/.exec(ref);
    const target = match && root.$defs?.[match[1]];
    if (!target) throw new Error(`Schema reference ${ref} cannot be resolved`);
    return target;
  }

  function validateNode(root, schema, value, path, errors) {
    if (errors.length >= MAX_ERRORS) return;
    if (schema === true) return;
    if (schema === false) {
      errors.push({ path: path || "/", message: "is not allowed" });
      return;
    }
    const add = (message, where = path) =>
      errors.length < MAX_ERRORS &&
      errors.push({ path: where || "/", message });
    if (schema.$ref) {
      validateNode(root, resolveRef(root, schema.$ref), value, path, errors);
    }
    if (schema.type !== undefined) {
      const types = Array.isArray(schema.type) ? schema.type : [schema.type];
      if (!types.some((type) => matchesType(value, type))) {
        add(`must be ${types.join(" or ")}`);
        return;
      }
    }
    if (schema.const !== undefined && !sameValue(schema.const, value))
      add(`must be ${JSON.stringify(schema.const)}`);
    if (schema.enum && !schema.enum.some((item) => sameValue(item, value)))
      add(
        `must be one of ${schema.enum.map((item) => JSON.stringify(item)).join(", ")}`,
      );

    if (typeof value === "string") {
      const length = [...value].length;
      if (schema.minLength !== undefined && length < schema.minLength)
        add(
          schema.minLength === 1
            ? "must not be empty"
            : `must be at least ${schema.minLength} characters`,
        );
      if (schema.maxLength !== undefined && length > schema.maxLength)
        add(`must be at most ${schema.maxLength} characters`);
      if (schema.pattern && !new RegExp(schema.pattern, "u").test(value))
        add(`must match ${schema.pattern}`);
    }
    if (typeof value === "number") {
      if (schema.minimum !== undefined && value < schema.minimum)
        add(`must be at least ${schema.minimum}`);
      if (schema.maximum !== undefined && value > schema.maximum)
        add(`must be at most ${schema.maximum}`);
    }
    if (Array.isArray(value)) {
      if (schema.minItems !== undefined && value.length < schema.minItems)
        add(`must have at least ${schema.minItems} item(s)`);
      if (schema.maxItems !== undefined && value.length > schema.maxItems)
        add(`must have at most ${schema.maxItems} item(s)`);
      if (schema.uniqueItems) {
        const seen = new Set();
        value.forEach((item, index) => {
          const key = JSON.stringify(item);
          if (seen.has(key)) add("is a duplicate", pointer(path, index));
          seen.add(key);
        });
      }
      if (schema.items !== undefined)
        value.forEach((item, index) =>
          validateNode(root, schema.items, item, pointer(path, index), errors),
        );
    }
    if (typeOf(value) === "object") {
      const keys = Object.keys(value);
      if (
        schema.minProperties !== undefined &&
        keys.length < schema.minProperties
      )
        add(
          `must have at least ${schema.minProperties} entr${schema.minProperties === 1 ? "y" : "ies"}`,
        );
      if (
        schema.maxProperties !== undefined &&
        keys.length > schema.maxProperties
      )
        add(`must have at most ${schema.maxProperties} entries`);
      (schema.required || []).forEach((key) => {
        if (!Object.prototype.hasOwnProperty.call(value, key))
          add("is required", pointer(path, key));
      });
      const properties = schema.properties || {};
      keys.forEach((key) => {
        const where = pointer(path, key);
        if (schema.propertyNames !== undefined)
          validateNode(root, schema.propertyNames, key, where, errors);
        if (Object.prototype.hasOwnProperty.call(properties, key))
          validateNode(root, properties[key], value[key], where, errors);
        else if (schema.additionalProperties === false)
          add("is not a known property", where);
        else if (
          schema.additionalProperties &&
          typeof schema.additionalProperties === "object"
        )
          validateNode(
            root,
            schema.additionalProperties,
            value[key],
            where,
            errors,
          );
      });
    }
    if (schema.anyOf) {
      const passes = schema.anyOf.some((option) => {
        const nested = [];
        validateNode(root, option, value, path, nested);
        return !nested.length;
      });
      if (!passes)
        add(
          schema.description
            ? `must be ${schema.description}`
            : "does not match any allowed shape",
        );
    }
    if (schema.oneOf) {
      const results = schema.oneOf.map((option) => {
        const nested = [];
        validateNode(root, option, value, path, nested);
        return nested;
      });
      const passing = results.filter((nested) => !nested.length).length;
      if (passing !== 1) {
        if (passing === 0 && results.length) {
          // Report the closest option's errors so the message stays useful.
          const closest = results.reduce((best, nested) =>
            nested.length < best.length ? nested : best,
          );
          closest.forEach((error) => add(error.message, error.path));
        } else add("matches more than one allowed shape");
      }
    }
    if (schema.not !== undefined) {
      const nested = [];
      validateNode(root, schema.not, value, path, nested);
      if (!nested.length) add("is not allowed here");
    }
  }

  /** Returns [] when `value` matches `schema`, otherwise path/message pairs. */
  function validate(schema, value) {
    assertSupported(schema);
    const errors = [];
    validateNode(schema, schema, value, "", errors);
    return errors;
  }

  const api = Object.freeze({ validate, assertSupported, KEYWORDS });
  global.ATLASStepTypes = global.ATLASStepTypes || {};
  global.ATLASStepTypes.schema = api;
})(typeof window !== "undefined" ? window : globalThis);
