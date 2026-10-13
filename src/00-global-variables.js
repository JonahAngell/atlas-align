// Users added to this group in Studioshare will be considered admins of the ATLAS Align app
export const SOURCE_LIBRARY_ADMIN_ROLE = "atlas-align-admin";

// Users added to this group in Studioshare will be considered members of the ATLAS Admin team
// This is different from the SOURCE_LIBRARY_ADMIN_ROLE group, which is where admins of this app in particular live.
export const ATLAS_ADMIN_ROLE = "atlas-admin-team";

// This table stores the local backup of the field library for ATLAS Align
export const FIELD_LIBRARY_TABLE = "atlas_field_library";

// This is the list of columns in the ATLAS field library
export const FIELD_LIBRARY_COLUMNS = Object.freeze([
  "Vanity Label/Field Display Name",
  "Source System",
  "Source Field Name",
  "Business Description",
  "Unique Field Identifier",
  "Current Source: Frequency",
  "Current Source: Population",
  "Data Category",
  "Field Format",
  "Audit - Authority Type",
  "Sample Value 1 ",
  "Sample Value 2",
  "Sample Value 3",
  "Field Status",
  "Current Source: Title",
  "Current Source",
  "History -  Source File Name",
  "Source File Format",
  "Field Type",
  "Max Characters",
  "Transformation logic",
  "Translation Logic",
  "Matching Key",
  "Developer Join Notes",
  "Developer Notes",
  "Schema Location ",
  "Field Owner - Logans List",
  "System of Record - Logans List",
  "Downstream Impact - Logans List",
  "Governance - Field Owner",
  "Governance - Last Validated Date",
  "Governance - Validation Notes",
  "ID",
]);
