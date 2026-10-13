import { readFileSync } from "node:fs";

/** Loads a UTF-8 SQL resource relative to the calling module URL. */
export function loadSql(relativePath, moduleUrl) {
  return readFileSync(new URL(relativePath, moduleUrl), "utf8");
}
