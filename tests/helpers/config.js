export function lifecycleConfig() {
  return {
    prefix: process.env.PLAYWRIGHT_TEST_AUDIT_PREFIX?.trim() || "PW Audit",
    preserveFailed: process.env.PLAYWRIGHT_PRESERVE_FAILED_AUDITS !== "false",
    assigned: process.env.PLAYWRIGHT_ASSIGNED_ANALYST_QUERY?.trim() || "",
    backup: process.env.PLAYWRIGHT_BACKUP_ANALYST_QUERY?.trim() || "",
    developer: process.env.PLAYWRIGHT_DEVELOPER_QUERY?.trim() || "",
    sourceOne: process.env.PLAYWRIGHT_SOURCE_ONE?.trim() || "",
    sourceTwo: process.env.PLAYWRIGHT_SOURCE_TWO?.trim() || "",
  };
}

export function uniqueAuditName(prefix, workerIndex = 0) {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "");
  return `${prefix} ${stamp} w${workerIndex}`;
}

export function missingInputs(config, names) {
  return names.filter((name) => !config[name]);
}
