/** Final database-only audit library compatibility overrides. */
if (typeof allAuditLibraryItems === "function") {
  allAuditLibraryItems = function allDatabaseAuditLibraryItems() {
    const items = (state.databaseAudits || []).map((audit) => ({
      value: `database:${audit.id}`,
      title: audit.name || audit.id,
      detail: `Revision ${audit.currentRevisionNumber || 0}${audit.updatedByUsername ? ` · ${audit.updatedByUsername}` : ""}`,
      kind: "Database Audit",
    }));
    if (typeof workbookState !== "undefined" && workbookState.loaded) {
      (workbookState.auditSheets || []).forEach((name) =>
        items.push({
          value: `workbook:${name}`,
          title: name,
          detail: "Workbook audit sheet",
          kind: "Workbook Import",
        }),
      );
    }
    return typeof alphaSortItems === "function"
      ? alphaSortItems(items, (item) => item.title)
      : items;
  };
}
