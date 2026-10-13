export function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}
