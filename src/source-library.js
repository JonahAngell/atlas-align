function listValue(value) {
  return String(value || "")
    .split(/[;,|]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function compactValues(values) {
  return values.map((value) => String(value || "").trim()).filter(Boolean);
}

/**
 * Groups Field Library rows into sources.
 * "Current Source" is the stable identity. "Current Source: Title" is only a label
 * and can be shared by more than one source.
 */
export function sourceLibraryFromRows(rows) {
  const groups = new Map();
  rows.forEach((row) => {
    const alias = String(row["Current Source"] || "").trim();
    if (!alias) return;
    if (!groups.has(alias)) groups.set(alias, []);
    groups.get(alias).push(row);
  });
  return [...groups.entries()]
    .map(([alias, sourceRows]) => {
      const first = sourceRows[0];
      const sourceFile =
        first["Current Source: Title"] ||
        first["History -  Source File Name"] ||
        alias;
      const fields = sourceRows.map((row, index) => ({
        id: row.ID,
        order: index + 1,
        sourceKey: alias,
        fieldName: row["Source Field Name"],
        rawFieldName: row["Source Field Name"],
        vanityLabel:
          row["Vanity Label/Field Display Name"] || row["Source Field Name"],
        label:
          row["Vanity Label/Field Display Name"] || row["Source Field Name"],
        businessDescription: row["Business Description"] || "",
        uniqueFieldIdentifier: row["Unique Field Identifier"] || "",
        dataCategory: row["Data Category"] || "",
        fieldFormat: row["Field Format"] || "",
        authorityType: row["Audit - Authority Type"] || "",
        sampleValues: compactValues([
          row["Sample Value 1 "],
          row["Sample Value 2"],
          row["Sample Value 3"],
        ]),
        fieldStatus: row["Field Status"] || "",
        fieldType: row["Field Type"] || "",
        maxCharacters: row["Max Characters"] || "",
        transformationLogic: row["Transformation logic"] || "",
        translationLogic: row["Translation Logic"] || "",
        matchingKeys: listValue(row["Matching Key"]),
        developerJoinNotes: row["Developer Join Notes"] || "",
        developerNotes: row["Developer Notes"] || "",
        schemaLocation: row["Schema Location "] || "",
        fieldOwner: row["Field Owner - Logans List"] || "",
        systemOfRecord: row["System of Record - Logans List"] || "",
        downstreamImpact: row["Downstream Impact - Logans List"] || "",
        governance: {
          governanceOwner: row["Governance - Field Owner"] || "",
          lastValidatedDate: row["Governance - Last Validated Date"] || "",
          validationNotes: row["Governance - Validation Notes"] || "",
        },
      }));
      return {
        version: 2,
        sourceKey: alias,
        sourceFile,
        alias,
        sourceMetadata: {
          sourceSystem: first["Source System"] || "",
          sourceTitle: first["Current Source: Title"] || sourceFile,
          frequency: first["Current Source: Frequency"] || "",
          population: first["Current Source: Population"] || "",
          sourceFileFormat: first["Source File Format"] || "",
          sourceOwner: first["Field Owner - Logans List"] || "",
        },
        fieldCount: fields.length,
        fields,
      };
    })
    .sort((a, b) =>
      a.sourceFile.localeCompare(b.sourceFile, undefined, {
        sensitivity: "base",
        numeric: true,
      }),
    );
}
