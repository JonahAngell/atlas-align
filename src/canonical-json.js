import { createHash } from "node:crypto";

/** Recursively sorts object keys so equivalent values serialize the same way. */
export function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((result, key) => {
        result[key] = stableValue(value[key]);
        return result;
      }, {});
  }
  return value;
}

/** Serializes a value after recursive key ordering. */
export function canonicalJson(value) {
  return JSON.stringify(stableValue(value));
}

/** SHA-256 hex digest of the recursive canonical JSON form. */
export function documentHash(value) {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}
