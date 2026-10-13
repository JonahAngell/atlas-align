import { existsSync, readFileSync } from "node:fs";

const KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Loads KEY=value pairs from a dotenv file.
 * Existing environment variables win. Values are never logged.
 */
export function loadEnvFile(filePath) {
  if (!filePath || !existsSync(filePath)) return;
  const text = readFileSync(filePath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator <= 0) continue;
    const key = trimmed.slice(0, separator).trim();
    if (!KEY_PATTERN.test(key) || process.env[key] !== undefined) continue;
    process.env[key] = trimmed.slice(separator + 1).trim();
  }
}
