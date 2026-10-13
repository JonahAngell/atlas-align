/**
 * 15j-logic-text-import.js
 * Import a Logic Builder step from an analyst sentence.
 * The parser is pure. The dialog maps file and column tokens onto audit sources.
 */
const ATLAS_IMPORT_UNRECOGNIZED =
  'This text could not be read as a Logic Builder step. Use a sentence the builder already writes, such as: If file "sap.hi0256" column "Nationality" is equal to text values "US" or "Minor Outl. Isl." THEN do not display. Reference source, Create new column, Join, UNION, Format, Split, Sort records, and filter sentences are also supported.';

const ATLAS_IMPORT_TITLES = {
  reference_source: "Reference Source",
  create_column: "Create Column",
  if_then: "IF / THEN",
  else: "ELSE",
  join: "Join / Union Sources",
  format_field: "Format Field",
  split_field: "Split Field",
  sort_records: "Sort Records",
  remove_duplicates: "Remove Duplicates",
  filter_rows: "Filter Rows",
  flag_records: "Flag Records",
};

const ATLAS_IMPORT_OPERATORS = [
  "is not equal to",
  "is equal to",
  "does not contain",
  "does not start with",
  "does not end with",
  "starts with",
  "ends with",
  "contains",
  "is greater than or equal to",
  "is greater than",
  "is less than or equal to",
  "is less than",
  "is not blank/null",
  "is blank/null",
  "is not blank",
  "is blank",
  "does not match expression",
  "matches expression",
];

const ATLAS_IMPORT_JOIN_TYPES = [
  "INNER JOIN",
  "LEFT JOIN",
  "RIGHT JOIN",
  "FULL OUTER JOIN",
  "UNION",
];

const ATLAS_IMPORT_FORMATS = [
  "eight digits with leading zeroes",
  "date format MM/DD/YYYY",
  "text",
  "number",
];

const ATLAS_IMPORT_SORTS = ["Ascending", "Descending"];

const ATLAS_IMPORT_DUPLICATES = [
  "Drop all duplicated records",
  "Keep first record",
  "Keep last record",
];

const ATLAS_IMPORT_FILTERS = ["Keep matching rows", "Exclude matching rows"];

function atlasImportFail(message) {
  return { ok: false, message: message || ATLAS_IMPORT_UNRECOGNIZED };
}

function atlasImportNormalizeText(value) {
  const raw = String(value || "")
    .replace(/[“”]/g, '"')
    .replace(/\u00a0/g, " ");
  let out = "";
  let quoted = false;
  let pendingSpace = false;
  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];
    if (char === '"') {
      if (!quoted && pendingSpace) out += " ";
      quoted = !quoted;
      pendingSpace = false;
      out += char;
      continue;
    }
    if (!quoted && /\s/.test(char)) {
      if (out) pendingSpace = true;
      continue;
    }
    if (pendingSpace) out += " ";
    pendingSpace = false;
    out += char;
  }
  return out.trim();
}

function atlasImportMaskQuotes(text) {
  return String(text || "").replace(/"(?:[^"\\]|\\.)*"/g, (match) =>
    " ".repeat(match.length),
  );
}

function atlasImportReadQuote(text, index) {
  if (text[index] !== '"') return null;
  let value = "";
  for (let cursor = index + 1; cursor < text.length; cursor += 1) {
    if (text[cursor] === "\\" && text[cursor + 1] === '"') {
      value += '"';
      cursor += 1;
      continue;
    }
    if (text[cursor] === '"') return { value, end: cursor + 1 };
    value += text[cursor];
  }
  return null;
}

function atlasImportRemainderOk(text) {
  return /^[:.\s]*$/.test(String(text || ""));
}

function atlasImportReadTableColumn(text) {
  const source = String(text || "");
  const leading = source.length - source.trimStart().length;
  const body = source.trimStart();
  const fileMatch = /^file\s+/i.exec(body);
  if (fileMatch) {
    const fileQuote = atlasImportReadQuote(body, fileMatch[0].length);
    if (!fileQuote) return null;
    const afterFile = body.slice(fileQuote.end);
    const columnMatch = /^\s+column\s+/i.exec(afterFile);
    if (!columnMatch) return null;
    const fieldQuote = atlasImportReadQuote(afterFile, columnMatch[0].length);
    if (!fieldQuote) return null;
    return {
      kind: "file-column",
      sourceToken: fileQuote.value,
      fieldToken: fieldQuote.value,
      end: leading + fileQuote.end + fieldQuote.end,
    };
  }
  const newColumnMatch = /^new\s+column\s+/i.exec(body);
  if (newColumnMatch) {
    const fieldQuote = atlasImportReadQuote(body, newColumnMatch[0].length);
    if (!fieldQuote) return null;
    return {
      kind: "new-column",
      sourceToken: "",
      fieldToken: fieldQuote.value,
      end: leading + fieldQuote.end,
    };
  }
  const columnMatch = /^column\s+/i.exec(body);
  if (columnMatch) {
    const fieldQuote = atlasImportReadQuote(body, columnMatch[0].length);
    if (!fieldQuote) return null;
    return {
      kind: "column",
      sourceToken: "",
      fieldToken: fieldQuote.value,
      end: leading + fieldQuote.end,
    };
  }
  return null;
}

function atlasImportMatchOperator(text) {
  const source = String(text || "").trimStart();
  const lower = source.toLowerCase();
  for (const operator of ATLAS_IMPORT_OPERATORS) {
    if (!lower.startsWith(operator)) continue;
    const next = lower.charAt(operator.length);
    if (next && !/[\s.]/.test(next)) continue;
    return {
      operator: atlasImportCanonicalOperator(operator),
      length: source.length - source.trimStart().length + operator.length,
    };
  }
  return null;
}

function atlasImportCanonicalOperator(operator) {
  const value = String(operator || "").toLowerCase();
  if (value === "is blank" || value === "is blank/null") return "is blank/null";
  if (value === "is not blank" || value === "is not blank/null")
    return "is not blank/null";
  return value;
}

function atlasImportReadQuotedList(text) {
  let rest = String(text || "").trim();
  if (!rest.startsWith('"')) return null;
  const values = [];
  while (rest) {
    const quoted = atlasImportReadQuote(rest, 0);
    if (!quoted) return null;
    if (quoted.value.trim()) values.push(quoted.value.trim());
    rest = rest.slice(quoted.end).trim();
    if (atlasImportRemainderOk(rest)) return values;
    const separator = /^(?:,\s*or\s+|,\s*|or\s+)/i.exec(rest);
    if (!separator) return null;
    rest = rest.slice(separator[0].length).trim();
    if (!rest) return null;
  }
  return values;
}

function atlasImportReadLooseList(text) {
  const rest = String(text || "").trim().replace(/\.$/, "");
  if (!rest || rest.includes('"')) return null;
  const values = rest
    .split(/\s+or\s+|,\s*/i)
    .map((item) => item.trim())
    .filter(Boolean);
  return values.length ? values : null;
}

function atlasImportReadValue(text, operator) {
  const source = String(text || "").trim();
  if (operator === "is blank/null" || operator === "is not blank/null") {
    if (!atlasImportRemainderOk(source.replace(/^(?:blank\/null|blank)\s*/i, "")))
      return null;
    return {
      valueMode: "blank",
      compareValue: "",
      expression: "",
      compareSourceToken: "",
      compareFieldToken: "",
    };
  }
  if (operator === "matches expression" || operator === "does not match expression") {
    return {
      valueMode: "expression",
      compareValue: "",
      expression: source.replace(/\.$/, "").trim(),
      compareSourceToken: "",
      compareFieldToken: "",
    };
  }
  let rest = source.replace(/^(?:text\s+)?values?\s+/i, "");
  const column = /^(?:file|new\s+column|column)\b/i.test(rest)
    ? atlasImportReadTableColumn(rest)
    : null;
  if (column && atlasImportRemainderOk(rest.slice(column.end))) {
    return {
      valueMode: "field",
      compareValue: "",
      expression: "",
      compareSourceToken: column.sourceToken,
      compareFieldToken: column.fieldToken,
    };
  }
  const quoted = atlasImportReadQuotedList(rest);
  if (quoted && quoted.length)
    return {
      valueMode: "values",
      compareValue: quoted.join("\n"),
      expression: "",
      compareSourceToken: "",
      compareFieldToken: "",
    };
  const loose = atlasImportReadLooseList(rest);
  if (loose)
    return {
      valueMode: "values",
      compareValue: loose.join("\n"),
      expression: "",
      compareSourceToken: "",
      compareFieldToken: "",
    };
  return null;
}

function atlasImportReadCondition(text) {
  const column = atlasImportReadTableColumn(text);
  if (!column || column.kind === "new-column") return null;
  const afterColumn = String(text || "").slice(column.end).trimStart();
  const operator = atlasImportMatchOperator(afterColumn);
  if (!operator) return null;
  const value = atlasImportReadValue(
    afterColumn.slice(operator.length),
    operator.operator,
  );
  if (!value) return null;
  return {
    sourceToken: column.sourceToken,
    fieldToken: column.fieldToken,
    operator: operator.operator,
    ...value,
  };
}

function atlasImportSplitConnectors(text) {
  const source = String(text || "").trim().replace(/^if\b\s*/i, "");
  const mask = atlasImportMaskQuotes(source);
  const expression = /\b(AND|OR)\b(?=\s+(?:file|column|new)\b)/gi;
  const splits = [];
  let match = expression.exec(mask);
  while (match) {
    splits.push({
      index: match.index,
      connector: match[1].toUpperCase(),
      length: match[0].length,
    });
    match = expression.exec(mask);
  }
  if (!splits.length) return { ok: true, parts: [{ connector: "IF", text: source }] };
  const connectors = splits.map((item) => item.connector);
  if (connectors.includes("AND") && connectors.includes("OR"))
    return atlasImportFail(
      "Mixed AND and OR connectors are not supported in one condition group. Use one connector type.",
    );
  const parts = [];
  let cursor = 0;
  splits.forEach((item, index) => {
    parts.push({
      connector: index === 0 ? "IF" : splits[index - 1].connector,
      text: source.slice(cursor, item.index).trim(),
    });
    cursor = item.index + item.length;
  });
  parts.push({
    connector: splits.at(-1).connector,
    text: source.slice(cursor).trim(),
  });
  if (parts.some((part) => !part.text))
    return atlasImportFail(
      "A condition is missing after AND or OR. Each condition needs a file and column.",
    );
  return { ok: true, parts };
}

function atlasImportSplitThen(text) {
  const mask = atlasImportMaskQuotes(text);
  const match = /\bTHEN\b/i.exec(mask);
  if (!match) return null;
  return {
    before: text.slice(0, match.index).trim().replace(/,\s*$/, ""),
    after: text
      .slice(match.index + match[0].length)
      .trim()
      .replace(/\.\s*$/, "")
      .trim(),
  };
}

function atlasImportSourceReference(id, token, label, binds, matchTokens) {
  const tokens = [token, ...(matchTokens || [])]
    .map((item) => String(item || "").trim())
    .filter(Boolean);
  return {
    id,
    kind: "source",
    token: tokens[0] || "",
    matchTokens: tokens,
    label,
    required: true,
    fileBind: binds.fileBind,
    aliasBind: binds.aliasBind,
    keyBind: binds.keyBind || "",
  };
}

function atlasImportFieldReference(id, token, label, sourceRefId, fieldBind) {
  return {
    id,
    kind: "field",
    token,
    label,
    required: true,
    sourceRefId,
    fieldBind,
    requiresJoinFields: true,
  };
}

function atlasImportTextControl(id, label, value, bind, required = true) {
  return {
    id,
    kind: "text",
    label,
    value: value || "",
    bind,
    required,
  };
}

function atlasImportValuesControl(id, label, value, bind) {
  return {
    id,
    kind: "values",
    label,
    value: value || "",
    bind,
    required: false,
  };
}

function atlasImportSelectControl(id, label, value, options, bind) {
  const list = options.includes(value) ? options : [value, ...options].filter(Boolean);
  return {
    id,
    kind: "select",
    label,
    value: value || list[0] || "",
    options: list,
    bind,
    required: true,
  };
}

function atlasImportDraft(stepType, details) {
  return {
    ok: true,
    stepType,
    title: ATLAS_IMPORT_TITLES[stepType] || "Logic Step",
    params: details.params || {},
    conditions: details.conditions || [],
    references: details.references || [],
    controls: details.controls || [],
  };
}

function atlasImportConditionDraft(parsed, index, connector) {
  const sourceId = `c${index}-source`;
  const fieldId = `c${index}-field`;
  const references = [];
  const controls = [
    atlasImportSelectControl(
      `c${index}-operator`,
      `${connector} operator`,
      parsed.operator,
      atlasImportOperatorsForMode(parsed.valueMode),
      `conditions.${index}.operator`,
    ),
  ];
  if (parsed.sourceToken) {
    references.push(
      atlasImportSourceReference(
        sourceId,
        parsed.sourceToken,
        `${connector} file`,
        {
          fileBind: `conditions.${index}.sourceFile`,
          aliasBind: `conditions.${index}.sourceAlias`,
        },
      ),
    );
  }
  references.push(
    atlasImportFieldReference(
      fieldId,
      parsed.fieldToken,
      `${connector} column`,
      parsed.sourceToken ? sourceId : "",
      `conditions.${index}.fieldName`,
    ),
  );
  if (parsed.valueMode === "values") {
    controls.push(
      atlasImportValuesControl(
        `c${index}-values`,
        `${connector} comparison values`,
        parsed.compareValue,
        `conditions.${index}.compareValue`,
      ),
    );
  }
  if (parsed.valueMode === "expression") {
    controls.push(
      atlasImportTextControl(
        `c${index}-expression`,
        `${connector} expression`,
        parsed.expression,
        `conditions.${index}.expression`,
      ),
    );
  }
  if (parsed.valueMode === "field") {
    const compareSourceId = `c${index}-compare-source`;
    if (parsed.compareSourceToken) {
      references.push(
        atlasImportSourceReference(
          compareSourceId,
          parsed.compareSourceToken,
          `${connector} compare file`,
          {
            fileBind: `conditions.${index}.compareSourceFile`,
            aliasBind: `conditions.${index}.compareSourceAlias`,
          },
        ),
      );
    }
    references.push(
      atlasImportFieldReference(
        `c${index}-compare-field`,
        parsed.compareFieldToken,
        `${connector} compare column`,
        parsed.compareSourceToken ? compareSourceId : sourceId,
        `conditions.${index}.compareFieldName`,
      ),
    );
  }
  return {
    condition: {
      connector,
      conditionType: "row_compare",
      sourceToken: parsed.sourceToken,
      fieldToken: parsed.fieldToken,
      sourceFile: "",
      sourceAlias: parsed.sourceToken,
      fieldName: parsed.fieldToken,
      operator: parsed.operator,
      valueMode: parsed.valueMode,
      compareValue: parsed.compareValue,
      compareSourceToken: parsed.compareSourceToken,
      compareFieldToken: parsed.compareFieldToken,
      compareSourceFile: "",
      compareSourceAlias: parsed.compareSourceToken,
      compareFieldName: parsed.compareFieldToken,
      expression: parsed.expression,
    },
    references,
    controls,
  };
}

function atlasImportOperatorsForMode(valueMode) {
  if (valueMode === "blank") return ["is blank/null", "is not blank/null"];
  if (valueMode === "field")
    return [
      "is equal to",
      "is not equal to",
      "is greater than",
      "is greater than or equal to",
      "is less than",
      "is less than or equal to",
    ];
  if (valueMode === "expression")
    return ["matches expression", "does not match expression"];
  return [
    "is equal to",
    "is not equal to",
    "contains",
    "does not contain",
    "starts with",
    "ends with",
  ];
}

function atlasImportParseConditions(groupText) {
  const split = atlasImportSplitConnectors(groupText);
  if (!split.ok) return split;
  const conditions = [];
  const references = [];
  const controls = [];
  for (let index = 0; index < split.parts.length; index += 1) {
    const part = split.parts[index];
    const parsed = atlasImportReadCondition(part.text);
    if (!parsed)
      return atlasImportFail(
        `The ${part.connector} condition could not be read. Use file "alias" column "field", then an operator such as is equal to.`,
      );
    const drafted = atlasImportConditionDraft(parsed, index, part.connector);
    conditions.push(drafted.condition);
    references.push(...drafted.references);
    controls.push(...drafted.controls);
  }
  return { ok: true, conditions, references, controls };
}

function atlasImportReadMath(text) {
  let rest = String(text || "").trim();
  const operations = [];
  const words = {
    plus: "+",
    minus: "-",
    times: "*",
    "divided by": "/",
  };
  while (rest) {
    const match = /^(plus|minus|times|divided by)\s+/i.exec(rest);
    if (!match) break;
    const word = match[1].toLowerCase();
    rest = rest.slice(match[0].length).trim();
    let operand = "";
    if (rest.startsWith('"')) {
      const quoted = atlasImportReadQuote(rest, 0);
      if (!quoted) return null;
      operand = quoted.value;
      rest = rest.slice(quoted.end).trim();
    } else {
      const number = /^[+-]?\d+(?:\.\d+)?/.exec(rest);
      if (!number) return null;
      operand = number[0];
      rest = rest.slice(number[0].length).trim();
    }
    operations.push({ operator: words[word], operand, operandType: "number" });
  }
  const rounding = atlasImportReadRounding(rest);
  if (rounding) return { operations, rounding, rest: rounding.rest };
  if (rest && !atlasImportRemainderOk(rest)) return null;
  return { operations, rounding: null, rest: "" };
}

function atlasImportReadRounding(text) {
  const match =
    /^,\s*then round\s+(down to|up to|to)\s+(the nearest whole number|\d+\s+decimal places?)\s*$/i.exec(
      String(text || "").trim().replace(/\.$/, ""),
    );
  if (!match) return null;
  const direction = match[1].toLowerCase();
  const mode =
    direction === "down to" ? "down" : direction === "up to" ? "up" : "nearest";
  const places = /^(\d+)/.exec(match[2]);
  return {
    rounding_mode: mode,
    rounding_decimal_places: places ? String(Number(places[1])) : "0",
    rest: "",
  };
}

function atlasImportParseThenAction(action) {
  const text = String(action || "").trim().replace(/\.\s*$/, "");
  if (!text)
    return {
      params: { then_action_type: "freeform", then_action: "" },
      references: [],
      controls: [],
    };
  if (/^do not display\b/i.test(text))
    return {
      params: {
        then_action_type: "do_not_display",
        then_action: "Do not display matching records",
      },
      references: [],
      controls: [],
    };
  if (/^display text response\b/i.test(text)) {
    const lead = /^display text response\s+/i.exec(text);
    const message = atlasImportReadQuote(text, lead[0].length);
    if (!message)
      return atlasImportFail("Display text needs a quoted message.");
    const rest = text.slice(message.end);
    const columnLead = /^\s+in(?:\s+new)?\s+column\s+/i.exec(rest);
    if (!columnLead)
      return atlasImportFail(
        'Display text needs a column, such as in new column "Error Message".',
      );
    const column = atlasImportReadQuote(rest, columnLead[0].length);
    if (!column || !atlasImportRemainderOk(rest.slice(column.end)))
      return atlasImportFail("Display text needs a quoted output column.");
    return {
      params: {
        then_action_type: "display_text",
        then_text: message.value,
        then_output_column: column.value,
      },
      references: [],
      controls: [
        atlasImportTextControl(
          "then-text",
          "Display text",
          message.value,
          "params.then_text",
        ),
        atlasImportTextControl(
          "then-output",
          "Output column",
          column.value,
          "params.then_output_column",
        ),
      ],
    };
  }
  const setLead = /^set\s+/i.exec(text);
  if (setLead) {
    const target = atlasImportReadQuote(text, setLead[0].length);
    if (target) {
      let rest = text.slice(target.end).trim().replace(/^value to\s+/i, "");
      if (text.slice(target.end).trim().toLowerCase().startsWith("value to")) {
        const shaped = atlasImportParseSetValue(target.value, rest);
        if (shaped) return shaped;
      }
    }
  }
  return {
    params: { then_action_type: "freeform", then_action: text },
    references: [],
    controls: [
      atlasImportTextControl(
        "then-freeform",
        "THEN action",
        text,
        "params.then_action",
      ),
    ],
  };
}

function atlasImportParseSetValue(target, rest) {
  const substring =
    /^the\s+(first|last)\s+(\d+)\s+characters\s+of\s+/i.exec(rest);
  if (substring) {
    const column = atlasImportReadTableColumn(rest.slice(substring[0].length));
    if (
      !column ||
      !atlasImportRemainderOk(rest.slice(substring[0].length + column.end))
    )
      return null;
    return atlasImportStringTransformAction({
      target,
      position: substring[1].toLowerCase(),
      count: String(Number(substring[2])),
      operation:
        substring[1].toLowerCase() === "last"
          ? "last_characters"
          : "first_characters",
      column,
      prefix: "params.then_",
    });
  }
  const lengthLead = /^the character length of\s+/i.exec(rest);
  if (lengthLead) {
    const column = atlasImportReadTableColumn(rest.slice(lengthLead[0].length));
    if (
      !column ||
      !atlasImportRemainderOk(rest.slice(lengthLead[0].length + column.end))
    )
      return null;
    return atlasImportStringTransformAction({
      target,
      position: "first",
      count: "",
      operation: "character_count",
      column,
      prefix: "params.then_",
    });
  }
  const column = atlasImportReadTableColumn(rest);
  if (!column) return null;
  const after = rest.slice(column.end).trim();
  if (/^value$/i.test(after.replace(/\.$/, "")))
    return atlasImportSetColumnAction(target, column);
  const math = atlasImportReadMath(after);
  if (!math) return null;
  const references = atlasImportColumnReferences(column, "then-value", "Value");
  return {
    params: {
      then_action_type: "set_column_calculation",
      then_target_column: target,
      then_math_json: JSON.stringify(math.operations),
      then_rounding_mode: math.rounding?.rounding_mode || "none",
      then_rounding_decimal_places:
        math.rounding?.rounding_decimal_places || "0",
    },
    references,
    controls: [
      atlasImportTextControl(
        "then-target",
        "Target column",
        target,
        "params.then_target_column",
      ),
    ],
  };
}

function atlasImportColumnReferences(column, idPrefix, label) {
  const references = [];
  if (column.sourceToken) {
    references.push(
      atlasImportSourceReference(
        `${idPrefix}-source`,
        column.sourceToken,
        `${label} file`,
        {
          fileBind: `params.${idPrefix.replace(/-/g, "_")}_source_file`,
          aliasBind: `params.${idPrefix.replace(/-/g, "_")}_source_alias`,
        },
      ),
    );
  }
  references.push(
    atlasImportFieldReference(
      `${idPrefix}-field`,
      column.fieldToken,
      `${label} column`,
      column.sourceToken ? `${idPrefix}-source` : "",
      `params.${idPrefix.replace(/-/g, "_")}_field`,
    ),
  );
  return references;
}

function atlasImportSetColumnAction(target, column) {
  const references = [];
  if (column.sourceToken) {
    references.push(
      atlasImportSourceReference(
        "then-value-source",
        column.sourceToken,
        "Value file",
        {
          fileBind: "params.then_value_source_file",
          aliasBind: "params.then_value_source_alias",
        },
      ),
    );
  }
  references.push(
    atlasImportFieldReference(
      "then-value-field",
      column.fieldToken,
      "Value column",
      column.sourceToken ? "then-value-source" : "",
      "params.then_value_field",
    ),
  );
  return {
    params: {
      then_action_type: "set_column_value",
      then_target_column: target,
    },
    references,
    controls: [
      atlasImportTextControl(
        "then-target",
        "Target column",
        target,
        "params.then_target_column",
      ),
    ],
  };
}

function atlasImportStringTransformAction(details) {
  const prefix = details.prefix || "params.";
  const params = {};
  if (prefix === "params.then_") {
    params.then_action_type = "set_column_string_transform";
    params.then_target_column = details.target;
    params.then_string_operation = details.operation;
    params.then_string_position = details.position;
    params.then_string_character_count = details.count;
  } else {
    params.value_mode = "String transformation";
    params.column_name = details.target;
    params.string_operation = details.operation;
    params.string_position = details.position;
    params.string_character_count = details.count;
  }
  const sourceId = prefix === "params.then_" ? "then-string-source" : "string-source";
  const fieldId = prefix === "params.then_" ? "then-string-field" : "string-field";
  const references = [];
  if (details.column.sourceToken) {
    references.push(
      atlasImportSourceReference(
        sourceId,
        details.column.sourceToken,
        "Source file",
        {
          fileBind:
            prefix === "params.then_"
              ? "params.then_string_source_file"
              : "params.string_source_file",
          aliasBind:
            prefix === "params.then_"
              ? "params.then_string_source_alias"
              : "params.string_source_alias",
        },
      ),
    );
  }
  references.push(
    atlasImportFieldReference(
      fieldId,
      details.column.fieldToken,
      "Source column",
      details.column.sourceToken ? sourceId : "",
      prefix === "params.then_"
        ? "params.then_string_source_field"
        : "params.string_source_field",
    ),
  );
  const controls = [
    atlasImportTextControl(
      prefix === "params.then_" ? "then-target" : "column-name",
      prefix === "params.then_" ? "Target column" : "New column name",
      details.target,
      prefix === "params.then_"
        ? "params.then_target_column"
        : "params.column_name",
    ),
  ];
  if (details.operation !== "character_count") {
    controls.push(
      atlasImportTextControl(
        "string-count",
        "Number of characters",
        details.count,
        prefix === "params.then_"
          ? "params.then_string_character_count"
          : "params.string_character_count",
      ),
    );
  }
  return { params, references, controls };
}

function atlasImportParseReference(text) {
  const lead = /^reference source file\s+/i.exec(text);
  if (!lead) return atlasImportFail(ATLAS_IMPORT_UNRECOGNIZED);
  const file = atlasImportReadQuote(text, lead[0].length);
  if (!file)
    return atlasImportFail("Reference source file needs a quoted file name.");
  let rest = text.slice(file.end).trim();
  let alias = "";
  const asLead = /^as\s+/i.exec(rest);
  if (asLead) {
    const aliasQuote = atlasImportReadQuote(rest, asLead[0].length);
    if (!aliasQuote)
      return atlasImportFail("Reference source alias needs quotes.");
    alias = aliasQuote.value;
    rest = rest.slice(aliasQuote.end).trim();
  }
  if (!atlasImportRemainderOk(rest))
    return atlasImportFail(
      "The reference sentence has text after the source file.",
    );
  const token = alias || file.value;
  return atlasImportDraft("reference_source", {
    params: { source_file: file.value, source_alias: alias || file.value },
    references: [
      atlasImportSourceReference(
        "reference-source",
        token,
        "Source file",
        {
          fileBind: "params.source_file",
          aliasBind: "params.source_alias",
          keyBind: "params.source_key",
        },
        [alias, file.value],
      ),
    ],
  });
}

function atlasImportParseCreate(text) {
  const blank = /^create new blank column\s+/i.exec(text);
  const lead = blank || /^create new column\s+/i.exec(text);
  if (!lead) return atlasImportFail(ATLAS_IMPORT_UNRECOGNIZED);
  const name = atlasImportReadQuote(text, lead[0].length);
  if (!name) return atlasImportFail("Create Column needs a quoted column name.");
  const rest = text.slice(name.end).trim();
  if (blank || atlasImportRemainderOk(rest))
    return atlasImportDraft("create_column", {
      params: {
        column_name: name.value,
        value_mode: "Static value",
        static_value: "",
      },
      controls: [
        atlasImportTextControl(
          "column-name",
          "New column name",
          name.value,
          "params.column_name",
        ),
      ],
    });
  const staticLead = /^and set value to\s+/i.exec(rest);
  if (staticLead) {
    const value = atlasImportReadQuote(rest, staticLead[0].length);
    if (!value || !atlasImportRemainderOk(rest.slice(value.end)))
      return atlasImportFail("The static column value needs quotes.");
    return atlasImportDraft("create_column", {
      params: {
        column_name: name.value,
        value_mode: "Static value",
        static_value: value.value,
      },
      controls: [
        atlasImportTextControl(
          "column-name",
          "New column name",
          name.value,
          "params.column_name",
        ),
        atlasImportTextControl(
          "static-value",
          "Static value",
          value.value,
          "params.static_value",
          false,
        ),
      ],
    });
  }
  const expressionLead = /^(?:using expression:|by combining:)\s+/i.exec(rest);
  if (expressionLead)
    return atlasImportDraft("create_column", {
      params: {
        column_name: name.value,
        value_mode: "Expression / calculation",
        expression_type: "custom_expression",
        expression: rest.slice(expressionLead[0].length).replace(/\.$/, "").trim(),
      },
      controls: [
        atlasImportTextControl(
          "column-name",
          "New column name",
          name.value,
          "params.column_name",
        ),
        atlasImportTextControl(
          "expression",
          "Expression",
          rest.slice(expressionLead[0].length).replace(/\.$/, "").trim(),
          "params.expression",
        ),
      ],
    });
  const concatLead = /^by concatenating\s+/i.exec(rest);
  if (concatLead) {
    const first = atlasImportReadTableColumn(rest.slice(concatLead[0].length));
    if (!first) return atlasImportFail("Concatenate needs a first file and column.");
    const between = rest.slice(concatLead[0].length + first.end).trim();
    const andLead = /^and\s+/i.exec(between);
    if (!andLead)
      return atlasImportFail("Concatenate needs a second file and column.");
    const second = atlasImportReadTableColumn(between.slice(andLead[0].length));
    if (!second || !atlasImportRemainderOk(between.slice(andLead[0].length + second.end)))
      return atlasImportFail("Concatenate needs a second file and column.");
    const references = [
      ...atlasImportBindColumn(first, "concat-1", "First", {
        fileBind: "params.concat_source_1",
        aliasBind: "params.concat_source_alias_1",
        fieldBind: "params.concat_field_1",
      }),
      ...atlasImportBindColumn(second, "concat-2", "Second", {
        fileBind: "params.concat_source_2",
        aliasBind: "params.concat_source_alias_2",
        fieldBind: "params.concat_field_2",
      }),
    ];
    return atlasImportDraft("create_column", {
      params: {
        column_name: name.value,
        value_mode: "Concatenate fields",
      },
      references,
      controls: [
        atlasImportTextControl(
          "column-name",
          "New column name",
          name.value,
          "params.column_name",
        ),
      ],
    });
  }
  const firstCharacters =
    /^using the (first|last) (\d+) characters of\s+/i.exec(rest);
  if (firstCharacters) {
    const column = atlasImportReadTableColumn(rest.slice(firstCharacters[0].length));
    if (!column || !atlasImportRemainderOk(rest.slice(firstCharacters[0].length + column.end)))
      return atlasImportFail(
        "The character transform needs a file and column.",
      );
    const shaped = atlasImportStringTransformAction({
      target: name.value,
      position: firstCharacters[1].toLowerCase(),
      count: String(Number(firstCharacters[2])),
      operation:
        firstCharacters[1].toLowerCase() === "last"
          ? "last_characters"
          : "first_characters",
      column,
      prefix: "params.",
    });
    return atlasImportDraft("create_column", shaped);
  }
  const lengthLead =
    /^(?:using the character count of|and set its value to the character length of)\s+/i.exec(
      rest,
    );
  if (lengthLead) {
    const column = atlasImportReadTableColumn(rest.slice(lengthLead[0].length));
    if (!column || !atlasImportRemainderOk(rest.slice(lengthLead[0].length + column.end)))
      return atlasImportFail("Character count needs a file and column.");
    return atlasImportDraft(
      "create_column",
      atlasImportStringTransformAction({
        target: name.value,
        position: "first",
        count: "",
        operation: "character_count",
        column,
        prefix: "params.",
      }),
    );
  }
  const usingLead = /^using\s+/i.exec(rest);
  if (usingLead) {
    const column = atlasImportReadTableColumn(rest.slice(usingLead[0].length));
    if (!column)
      return atlasImportFail(
        'Create Column needs a source, such as using file "alias" column "field".',
      );
    const after = rest.slice(usingLead[0].length + column.end).trim();
    if (atlasImportRemainderOk(after)) {
      return atlasImportDraft("create_column", {
        params: {
          column_name: name.value,
          value_mode: "Source field value",
        },
        references: atlasImportBindColumn(column, "source-field", "Source", {
          fileBind: "params.source_file",
          aliasBind: "params.source_alias",
          fieldBind: "params.field_name",
        }),
        controls: [
          atlasImportTextControl(
            "column-name",
            "New column name",
            name.value,
            "params.column_name",
          ),
        ],
      });
    }
    const math = atlasImportReadMath(after);
    if (!math)
      return atlasImportFail(
        "The calculation after the source field could not be read.",
      );
    return atlasImportDraft("create_column", {
      params: {
        column_name: name.value,
        value_mode: "Source field value",
        source_math_json: JSON.stringify(math.operations),
        rounding_mode: math.rounding?.rounding_mode || "none",
        rounding_decimal_places: math.rounding?.rounding_decimal_places || "0",
      },
      references: atlasImportBindColumn(column, "source-field", "Source", {
        fileBind: "params.source_file",
        aliasBind: "params.source_alias",
        fieldBind: "params.field_name",
      }),
      controls: [
        atlasImportTextControl(
          "column-name",
          "New column name",
          name.value,
          "params.column_name",
        ),
      ],
    });
  }
  return atlasImportFail(
    "This Create Column sentence does not match a column value the builder can store.",
  );
}

function atlasImportBindColumn(column, idPrefix, label, binds) {
  const references = [];
  if (column.sourceToken) {
    references.push(
      atlasImportSourceReference(
        `${idPrefix}-source`,
        column.sourceToken,
        `${label} file`,
        { fileBind: binds.fileBind, aliasBind: binds.aliasBind },
      ),
    );
  }
  references.push(
    atlasImportFieldReference(
      `${idPrefix}-field`,
      column.fieldToken,
      `${label} column`,
      column.sourceToken ? `${idPrefix}-source` : "",
      binds.fieldBind,
    ),
  );
  return references;
}

function atlasImportParseJoin(text) {
  const lead = /^join\s+/i.exec(text);
  const left = atlasImportReadTableColumn(text.slice(lead[0].length));
  if (!left) return atlasImportFail("Join needs a left file and column.");
  const between = text.slice(lead[0].length + left.end).trim();
  const andLead = /^and\s+/i.exec(between);
  if (!andLead) return atlasImportFail("Join needs a right file and column.");
  const right = atlasImportReadTableColumn(between.slice(andLead[0].length));
  if (!right || !atlasImportRemainderOk(between.slice(andLead[0].length + right.end)))
    return atlasImportFail("Join needs a right file and column.");
  return atlasImportDraft("join", {
    params: { join_type: "INNER JOIN" },
    references: [
      ...atlasImportBindColumn(left, "left", "Left", {
        fileBind: "params.left_source",
        aliasBind: "params.left_alias",
        fieldBind: "params.left_field",
      }),
      ...atlasImportBindColumn(right, "right", "Right", {
        fileBind: "params.right_source",
        aliasBind: "params.right_alias",
        fieldBind: "params.right_field",
      }),
    ],
    controls: [
      atlasImportSelectControl(
        "join_type",
        "Join type",
        "INNER JOIN",
        ATLAS_IMPORT_JOIN_TYPES,
        "params.join_type",
      ),
    ],
  });
}

function atlasImportParseUnion(text) {
  const lead = /^union file\s+/i.exec(text);
  if (!lead) return atlasImportFail(ATLAS_IMPORT_UNRECOGNIZED);
  const left = atlasImportReadQuote(text, lead[0].length);
  if (!left) return atlasImportFail("UNION needs a quoted left file.");
  let rest = text.slice(left.end).trim();
  const andLead = /^and file\s+/i.exec(rest);
  if (!andLead) return atlasImportFail("UNION needs a right file.");
  const right = atlasImportReadQuote(rest, andLead[0].length);
  if (!right) return atlasImportFail("UNION needs a quoted right file.");
  rest = rest.slice(right.end).trim();
  const outputLead = /^,?\s*reference as file\s+/i.exec(rest);
  if (!outputLead) return atlasImportFail("UNION needs a referenced output file.");
  const output = atlasImportReadQuote(rest, outputLead[0].length);
  if (!output || !atlasImportRemainderOk(rest.slice(output.end)))
    return atlasImportFail("UNION needs a quoted output file.");
  return atlasImportDraft("join", {
    params: { join_type: "UNION" },
    references: [
      atlasImportSourceReference("union-left", left.value, "Left file", {
        fileBind: "params.left_source",
        aliasBind: "params.left_alias",
      }),
      atlasImportSourceReference("union-right", right.value, "Right file", {
        fileBind: "params.right_source",
        aliasBind: "params.right_alias",
      }),
      atlasImportSourceReference("union-output", output.value, "Output file", {
        fileBind: "params.output_source",
        aliasBind: "params.output_alias",
      }),
    ],
    controls: [
      atlasImportSelectControl(
        "join_type",
        "Join type",
        "UNION",
        ATLAS_IMPORT_JOIN_TYPES,
        "params.join_type",
      ),
    ],
  });
}

function atlasImportParseSimpleColumnStep(text, stepType, leadPattern, afterReader) {
  const lead = leadPattern.exec(text);
  if (!lead) return atlasImportFail(ATLAS_IMPORT_UNRECOGNIZED);
  const column = atlasImportReadTableColumn(text.slice(lead[0].length));
  if (!column)
    return atlasImportFail("This sentence needs a file and column.");
  const rest = text.slice(lead[0].length + column.end).trim();
  const extra = afterReader(rest, column);
  if (!extra?.ok) return extra || atlasImportFail(ATLAS_IMPORT_UNRECOGNIZED);
  return atlasImportDraft(stepType, {
    params: extra.params || {},
    references: atlasImportBindColumn(column, "subject", "Source", {
      fileBind: "params.source_file",
      aliasBind: "params.source_alias",
      fieldBind: "params.field_name",
    }).concat(extra.references || []),
    controls: extra.controls || [],
  });
}

function atlasImportParseFormat(text) {
  return atlasImportParseSimpleColumnStep(
    text,
    "format_field",
    /^format\s+/i,
    (rest) => {
      const lead = /^as\s+/i.exec(rest);
      if (!lead) return atlasImportFail("Format needs a format after as.");
      const format = rest.slice(lead[0].length).replace(/\.$/, "").trim();
      if (!format) return atlasImportFail("Format needs a format name.");
      return {
        ok: true,
        params: { format },
        controls: [
          atlasImportSelectControl(
            "format",
            "Format",
            format,
            ATLAS_IMPORT_FORMATS,
            "params.format",
          ),
        ],
      };
    },
  );
}

function atlasImportParseSplit(text) {
  return atlasImportParseSimpleColumnStep(
    text,
    "split_field",
    /^split\s+/i,
    (rest) => {
      const lead = /^on the\s+/i.exec(rest);
      if (!lead) return atlasImportFail('Split needs on the "delimiter".');
      const delimiter = atlasImportReadQuote(rest, lead[0].length);
      if (!delimiter) return atlasImportFail("Split needs a quoted delimiter.");
      const after = rest.slice(delimiter.end).trim();
      const display = /^and display\s+/i.exec(after);
      if (!display) return atlasImportFail("Split needs a display part.");
      const outputLead = /\s+in column\s+/i.exec(after.slice(display[0].length));
      if (!outputLead) return atlasImportFail("Split needs an output column.");
      const part = after
        .slice(display[0].length, display[0].length + outputLead.index)
        .trim();
      const output = atlasImportReadQuote(
        after,
        display[0].length + outputLead.index + outputLead[0].length,
      );
      if (!output) return atlasImportFail("Split needs a quoted output column.");
      return {
        ok: true,
        params: { split_on: delimiter.value, split_part: part, output_column: output.value },
        controls: [
          atlasImportTextControl(
            "split-on",
            "Split on",
            delimiter.value,
            "params.split_on",
          ),
          atlasImportTextControl(
            "split-part",
            "Display part",
            part,
            "params.split_part",
          ),
          atlasImportTextControl(
            "split-output",
            "Output column",
            output.value,
            "params.output_column",
          ),
        ],
      };
    },
  );
}

function atlasImportParseSort(text) {
  return atlasImportParseSimpleColumnStep(
    text,
    "sort_records",
    /^sort records by\s+/i,
    (rest) => {
      const match = /^in\s+(ascending|descending)\s+order\s*$/i.exec(
        rest.replace(/\.$/, "").trim(),
      );
      if (!match) return atlasImportFail("Sort needs Ascending or Descending order.");
      const direction = match[1].toLowerCase() === "descending" ? "Descending" : "Ascending";
      return {
        ok: true,
        params: { sort_direction: direction },
        controls: [
          atlasImportSelectControl(
            "sort-direction",
            "Sort direction",
            direction,
            ATLAS_IMPORT_SORTS,
            "params.sort_direction",
          ),
        ],
      };
    },
  );
}

function atlasImportParseDuplicates(text) {
  return atlasImportParseSimpleColumnStep(
    text,
    "remove_duplicates",
    /^(?:if\s+)?/i,
    (rest) => {
      const lead = /^value appears more than once in the column,\s*/i.exec(rest);
      if (!lead)
        return atlasImportFail(
          "Remove Duplicates needs the phrase value appears more than once in the column.",
        );
      const actionText = rest.slice(lead[0].length).replace(/\.$/, "").trim();
      const action = ATLAS_IMPORT_DUPLICATES.find(
        (item) => item.toLowerCase() === actionText.toLowerCase(),
      );
      if (!action)
        return atlasImportFail(
          "Remove Duplicates needs Keep first record, Keep last record, or Drop all duplicated records.",
        );
      return {
        ok: true,
        params: { duplicate_action: action },
        controls: [
          atlasImportSelectControl(
            "duplicate-action",
            "Duplicate action",
            action,
            ATLAS_IMPORT_DUPLICATES,
            "params.duplicate_action",
          ),
        ],
      };
    },
  );
}

function atlasImportParseFilter(before, action) {
  const parsed = atlasImportParseConditions(before);
  if (!parsed.ok) return parsed;
  if (parsed.conditions.length !== 1)
    return atlasImportFail("Filter rows uses one condition.");
  const filter = ATLAS_IMPORT_FILTERS.find(
    (item) => item.toLowerCase() === action.toLowerCase(),
  );
  const condition = parsed.conditions[0];
  return atlasImportDraft("filter_rows", {
    params: {
      operator: condition.operator,
      compare_value: condition.compareValue,
      filter_action: filter,
    },
    references: parsed.references.map(atlasImportRetargetFilterReference),
    controls: [
      ...parsed.controls
        .filter((control) => control.id.endsWith("-operator") || control.id.endsWith("-values"))
        .map((control) => ({
          ...control,
          bind: control.id.endsWith("-operator")
            ? "params.operator"
            : "params.compare_value",
        })),
      atlasImportSelectControl(
        "filter-action",
        "Filter action",
        filter,
        ATLAS_IMPORT_FILTERS,
        "params.filter_action",
      ),
    ],
  });
}

function atlasImportRetargetFilterReference(reference) {
  if (reference.fileBind === "conditions.0.sourceFile")
    return { ...reference, fileBind: "params.source_file", aliasBind: "params.source_alias" };
  if (reference.fieldBind === "conditions.0.fieldName")
    return { ...reference, fieldBind: "params.field_name", requiresJoinFields: false };
  return reference;
}

function atlasImportParseFlag(before, details) {
  const parsed = atlasImportParseConditions(before);
  if (!parsed.ok) return parsed;
  if (parsed.conditions.length !== 1)
    return atlasImportFail("Flag records uses one condition.");
  const condition = parsed.conditions[0];
  const params = {
    operator: condition.operator,
    compare_value: condition.compareValue,
    flag_action: details.flag_action,
  };
  const controls = parsed.controls
    .filter((control) => control.id.endsWith("-operator") || control.id.endsWith("-values"))
    .map((control) => ({
      ...control,
      bind: control.id.endsWith("-operator") ? "params.operator" : "params.compare_value",
    }));
  if (details.flag_action === "display_text") {
    const lead = /^display text response\s+/i.exec(details.action);
    const message = lead ? atlasImportReadQuote(details.action, lead[0].length) : null;
    const rest = message ? details.action.slice(message.end) : "";
    const columnLead = /^\s+in\s+column\s+/i.exec(rest);
    const column =
      columnLead && atlasImportReadQuote(rest, columnLead[0].length);
    if (!message || !column)
      return atlasImportFail("Flag display text needs a quoted message and column.");
    params.message = message.value;
    params.output_column = column.value;
    controls.push(
      atlasImportTextControl("flag-message", "Message", message.value, "params.message"),
      atlasImportTextControl(
        "flag-output",
        "Output column",
        column.value,
        "params.output_column",
      ),
    );
  }
  return atlasImportDraft("flag_records", {
    params,
    references: parsed.references.map(atlasImportRetargetFilterReference),
    controls,
  });
}

function atlasImportParseIfThen(before, action) {
  const parsed = atlasImportParseConditions(before);
  if (!parsed.ok) return parsed;
  const thenAction = atlasImportParseThenAction(action);
  if (!thenAction.ok && thenAction.message) return thenAction;
  return atlasImportDraft("if_then", {
    params: thenAction.params,
    conditions: parsed.conditions,
    references: [...parsed.references, ...thenAction.references],
    controls: [...parsed.controls, ...thenAction.controls],
  });
}

function atlasImportParseElse(text) {
  const body = text.replace(/^else\b\s*/i, "").replace(/\.\s*$/, "").trim();
  if (!body || body === ":")
    return atlasImportDraft("else", {
      params: { then_action_type: "freeform", then_action: "" },
    });
  const action = atlasImportParseThenAction(body);
  if (action.message && action.ok === false) return action;
  return atlasImportDraft("else", action);
}

function atlasParseImportedLogicText(value) {
  const text = atlasImportNormalizeText(value);
  if (!text) return atlasImportFail("Enter a logic sentence to import.");
  const head = text.toLowerCase();
  if (head.startsWith("reference source file")) return atlasImportParseReference(text);
  if (head.startsWith("create new blank column") || head.startsWith("create new column"))
    return atlasImportParseCreate(text);
  if (head.startsWith("join ")) return atlasImportParseJoin(text);
  if (head.startsWith("union file")) return atlasImportParseUnion(text);
  if (head.startsWith("format ")) return atlasImportParseFormat(text);
  if (head.startsWith("split ")) return atlasImportParseSplit(text);
  if (head.startsWith("sort records")) return atlasImportParseSort(text);
  if (/^if\b/i.test(text) && /appears more than once/i.test(text))
    return atlasImportParseDuplicates(text);
  if (head.startsWith("else")) return atlasImportParseElse(text);
  if (/^if\b/i.test(text)) {
    const split = atlasImportSplitThen(text);
    if (!split) return atlasImportFail(ATLAS_IMPORT_UNRECOGNIZED);
    if (/^(keep matching rows|exclude matching rows)$/i.test(split.after))
      return atlasImportParseFilter(split.before, split.after);
    if (/^do NOT display\b/.test(split.after))
      return atlasImportParseFlag(split.before, { flag_action: "do_not_display" });
    if (
      /^display text response\b/i.test(split.after) &&
      !/\bin new column\b/i.test(split.after)
    )
      return atlasImportParseFlag(split.before, {
        flag_action: "display_text",
        action: split.after,
      });
    return atlasImportParseIfThen(split.before, split.after);
  }
  return atlasImportFail(ATLAS_IMPORT_UNRECOGNIZED);
}

function atlasLogicImportNormalize(value) {
  return String(value || "").trim().toLowerCase();
}

function atlasLogicImportIdentity(source) {
  return {
    stable: [
      source?.sourceKey,
      source?.catalogKey,
      source?.sourceReferenceId,
      source?.id,
      source?.alias,
    ],
    display: [source?.sourceFile, source?.file, source?.name],
  };
}

function atlasLogicImportMatchSources(sources, tokens) {
  const wanted = new Set(
    (tokens || []).map(atlasLogicImportNormalize).filter(Boolean),
  );
  if (!wanted.size) return { match: null, ambiguous: false, matches: [] };
  const list = sources || [];
  const stable = list.filter((source) =>
    atlasLogicImportIdentity(source).stable.some((value) =>
      wanted.has(atlasLogicImportNormalize(value)),
    ),
  );
  if (stable.length === 1) return { match: stable[0], ambiguous: false, matches: stable };
  if (stable.length > 1)
    return { match: null, ambiguous: true, matches: stable };
  const display = list.filter((source) =>
    atlasLogicImportIdentity(source).display.some((value) =>
      wanted.has(atlasLogicImportNormalize(value)),
    ),
  );
  if (display.length === 1)
    return { match: display[0], ambiguous: false, matches: display };
  if (display.length > 1)
    return { match: null, ambiguous: true, matches: display };
  return { match: null, ambiguous: false, matches: [] };
}

function atlasClassifyLogicImportSource(token, options = {}) {
  const tokens = [token, ...(options.matchTokens || [])];
  const selected = atlasLogicImportMatchSources(options.selectedSources || [], tokens);
  if (selected.match)
    return {
      status: "in-use",
      source: selected.match,
      matches: [],
      eligibleToUse: false,
    };
  if (selected.ambiguous)
    return {
      status: "ambiguous-in-use",
      source: null,
      matches: selected.matches,
      eligibleToUse: false,
    };
  const library = atlasLogicImportMatchSources(options.librarySources || [], tokens);
  if (library.match)
    return {
      status: "library",
      source: library.match,
      matches: [library.match],
      eligibleToUse: true,
    };
  if (library.ambiguous)
    return {
      status: "ambiguous-library",
      source: null,
      matches: library.matches,
      eligibleToUse: false,
    };
  return { status: "unknown", source: null, matches: [], eligibleToUse: false };
}

function atlasSuggestLogicImportField(token, source) {
  if (!source) return { status: "unmapped", fieldName: "" };
  const wanted = atlasLogicImportNormalize(token);
  const matches = (source.fields || []).filter((field) =>
    [
      field.fieldName,
      field.rawFieldName,
      field.name,
      field.label,
      field.vanityLabel,
    ].some((value) => atlasLogicImportNormalize(value) === wanted),
  );
  if (matches.length === 1) {
    const field = matches[0];
    return {
      status: "matched",
      fieldName: String(
        field.fieldName || field.rawFieldName || field.name || field.label || "",
      ),
    };
  }
  if (matches.length > 1) return { status: "ambiguous", fieldName: "" };
  return { status: "unmapped", fieldName: "" };
}

function atlasSuggestLogicImportMappings(draft, catalogs = {}) {
  const references = draft?.references || [];
  return references.map((reference) => {
    if (reference.kind === "source") {
      return {
        ...reference,
        ...atlasClassifyLogicImportSource(reference.token, {
          ...catalogs,
          matchTokens: reference.matchTokens,
        }),
      };
    }
    if (reference.kind === "field") {
      const sourceRef = references.find((item) => item.id === reference.sourceRefId);
      const sourceClass = sourceRef
        ? atlasClassifyLogicImportSource(sourceRef.token, {
            ...catalogs,
            matchTokens: sourceRef.matchTokens,
          })
        : null;
      const source = sourceClass?.status === "in-use" ? sourceClass.source : null;
      return {
        ...reference,
        ...atlasSuggestLogicImportField(reference.token, source),
        sourceStatus: sourceClass?.status || "unknown",
      };
    }
    return reference;
  });
}

function atlasImportSetPath(target, path, value) {
  const parts = String(path || "").split(".").filter(Boolean);
  if (!parts.length) return;
  let node = target;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const key = parts[index];
    const next = parts[index + 1];
    if (node[key] == null) node[key] = /^\d+$/.test(next) ? [] : {};
    node = node[key];
  }
  node[parts.at(-1)] = value;
}

function atlasImportCloneDraft(draft) {
  return {
    params: JSON.parse(JSON.stringify(draft.params || {})),
    conditions: JSON.parse(JSON.stringify(draft.conditions || [])),
  };
}

function atlasImportLegacyType(stepType) {
  if (typeof legacyTypeFromStepType === "function")
    return legacyTypeFromStepType(stepType);
  if (stepType === "reference_source") return "source";
  if (stepType === "create_column") return "create";
  if (stepType === "join") return "join";
  if (stepType === "if_then" || stepType === "else" || stepType === "filter_rows")
    return "if";
  return "if";
}

function atlasImportMaterialize(draft, choices = {}) {
  if (!draft?.ok) return atlasImportFail(draft?.message);
  const cloned = atlasImportCloneDraft(draft);
  const joinType = choices.controls?.join_type || cloned.params.join_type || "";
  const union = String(joinType).toUpperCase() === "UNION";
  for (const control of draft.controls || []) {
    const value = Object.prototype.hasOwnProperty.call(
      choices.controls || {},
      control.id,
    )
      ? choices.controls[control.id]
      : control.value;
    if (control.required && !String(value || "").trim())
      return atlasImportFail(`Enter a value for ${control.label}.`);
    atlasImportSetPath(cloned, control.bind, value);
  }
  for (const reference of draft.references || []) {
    if (union && reference.requiresJoinFields) continue;
    if (reference.kind === "source") {
      const chosen = choices.sources?.[reference.id];
      if (reference.required && !chosen?.sourceFile && !chosen?.sourceKey)
        return atlasImportFail(`Choose a source for "${reference.token}".`);
      if (!chosen) continue;
      if (reference.fileBind)
        atlasImportSetPath(
          cloned,
          reference.fileBind,
          chosen.sourceFile || chosen.sourceAlias || chosen.sourceKey,
        );
      if (reference.aliasBind)
        atlasImportSetPath(
          cloned,
          reference.aliasBind,
          chosen.sourceAlias || chosen.sourceFile || chosen.sourceKey,
        );
      if (reference.keyBind)
        atlasImportSetPath(cloned, reference.keyBind, chosen.sourceKey || "");
    }
    if (reference.kind === "field") {
      const fieldName = choices.fields?.[reference.id] || "";
      if (reference.required && !String(fieldName).trim())
        return atlasImportFail(`Choose a column for "${reference.token}".`);
      if (reference.fieldBind) atlasImportSetPath(cloned, reference.fieldBind, fieldName);
    }
  }
  if (draft.stepType === "reference_source") {
    const source = choices.sources?.["reference-source"];
    if (!source?.sourceKey && !source?.sourceFile)
      return atlasImportFail("Choose a source for this reference step.");
    return {
      ok: true,
      referenceOnly: true,
      sourceKey: source.sourceKey || source.sourceFile,
      sourceFile: source.sourceFile || "",
      sourceAlias: source.sourceAlias || "",
      label: source.sourceAlias || source.sourceFile || source.sourceKey,
    };
  }
  if (draft.stepType === "if_then" || draft.stepType === "else") {
    cloned.conditions = (cloned.conditions || []).map((condition, index) => ({
      id: condition.id || `cond_${index + 1}`,
      connector: index === 0 ? "IF" : condition.connector || "AND",
      conditionType: "row_compare",
      sourceFile: condition.sourceFile || "",
      sourceAlias: condition.sourceAlias || "",
      fieldName: condition.fieldName || "",
      operator: condition.operator || "is equal to",
      valueMode: condition.valueMode || "values",
      compareValue: condition.compareValue || "",
      compareSourceFile: condition.compareSourceFile || "",
      compareSourceAlias: condition.compareSourceAlias || "",
      compareFieldName: condition.compareFieldName || "",
      expression: condition.expression || "",
    }));
    if (draft.stepType === "if_then")
      cloned.params.conditions_json = JSON.stringify(cloned.conditions);
  }
  const params = cloned.params;
  const step = {
    id: "",
    enabled: true,
    parentId: null,
    branchType: "root",
    sortOrder: 0,
    title: draft.title,
    type: atlasImportLegacyType(draft.stepType),
    step_type: draft.stepType,
    source:
      params.source_file ||
      params.left_source ||
      cloned.conditions?.[0]?.sourceFile ||
      "",
    field:
      params.field_name ||
      params.column_name ||
      cloned.conditions?.[0]?.fieldName ||
      "",
    action: "",
    notes: "",
    conditions:
      draft.stepType === "if_then"
        ? cloned.conditions.map((condition) => ({
            id: condition.id,
            field: condition.fieldName,
            operator: condition.operator,
            value: condition.compareValue,
          }))
        : [],
    params,
  };
  if (draft.stepType === "if_then" && !params.then_action_type)
    params.then_action_type = "freeform";
  return { ok: true, referenceOnly: false, step };
}

function atlasImportEsc(value) {
  if (typeof esc === "function") return esc(value);
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

let atlasLogicImportState = null;

function atlasLogicImportSelectedSources() {
  if (typeof atlasSelectedAuditSources === "function")
    return atlasSelectedAuditSources();
  return state?.audit?.sources || [];
}

function atlasLogicImportLibrarySources() {
  if (typeof sourceCatalogEntries === "function") return sourceCatalogEntries();
  return (typeof repoLibraryState !== "undefined" && repoLibraryState?.sourceFiles) || [];
}

function atlasLogicImportCatalogs() {
  return {
    selectedSources: atlasLogicImportSelectedSources(),
    librarySources: atlasLogicImportLibrarySources(),
  };
}

function atlasLogicImportSourceChoice(source) {
  return {
    sourceKey: source.sourceKey || source.alias || source.sourceFile || source.name || "",
    sourceFile: source.sourceFile || source.name || source.sourceKey || "",
    sourceAlias: source.alias || source.sourceKey || source.sourceFile || source.name || "",
    fields: source.fields || [],
  };
}

function atlasLogicImportSourceLabel(source) {
  const alias = source.alias || source.sourceKey || "";
  const file = source.sourceFile || source.name || "";
  if (alias && file && alias !== file) return `${alias} (${file})`;
  return alias || file || "Source";
}

function atlasLogicImportFindSource(key) {
  const wanted = atlasLogicImportNormalize(key);
  return (
    atlasLogicImportSelectedSources().find((source) =>
      [
        source.sourceKey,
        source.alias,
        source.sourceFile,
        source.name,
        source.id,
      ].some((value) => atlasLogicImportNormalize(value) === wanted),
    ) || null
  );
}

function atlasOpenLogicImportDialog() {
  document.querySelector("[data-logic-import-root]")?.remove();
  atlasLogicImportState = {
    draft: null,
    declined: new Set(),
    text: "",
  };
  const root = document.createElement("div");
  root.className = "logic-import-backdrop";
  root.dataset.logicImportRoot = "true";
  root.innerHTML = `<div class="logic-import-dialog" role="dialog" aria-modal="true" aria-labelledby="logicImportTitle"><div class="logic-import-header"><h2 id="logicImportTitle">Import step from text</h2><button type="button" class="logic-import-close" data-logic-import-close aria-label="Close">×</button></div><label class="logic-import-label" for="logicImportText">Logic sentence</label><textarea id="logicImportText" class="logic-import-text" rows="5" placeholder='If file &quot;sap.hi0256&quot; column &quot;Nationality&quot; is equal to text values &quot;US&quot; or &quot;Minor Outl. Isl.&quot; THEN do not display'></textarea><p class="logic-import-hint">Paste a sentence the Logic Builder already writes. You will map each file and column before the rule is added.</p><div id="logicImportError" class="logic-import-error" role="alert" hidden></div><div id="logicImportMapping" class="logic-import-mapping"></div><div class="logic-import-actions"><button type="button" class="btn secondary" data-logic-import-close>Cancel</button><button type="button" class="btn secondary" data-logic-import-read>Read text</button><button type="button" class="btn primary" data-logic-import-add disabled aria-describedby="logicImportAddReason">Add Rule</button></div><p id="logicImportAddReason" class="logic-import-reason">Read a logic sentence to continue.</p></div>`;
  document.body.append(root);
  document.getElementById("logicImportText")?.focus();
}

function atlasCloseLogicImportDialog() {
  if (typeof window !== "undefined" && window.ATLASVisualPicker?.isOpen?.())
    window.ATLASVisualPicker.close("dismiss");
  atlasLogicImportLowerPicker();
  document.querySelector("[data-logic-import-root]")?.remove();
  atlasLogicImportState = null;
  document.getElementById("importLogicTextBtn")?.focus();
}

function atlasLogicImportShowError(message) {
  const error = document.getElementById("logicImportError");
  if (!error) return;
  if (!message) {
    error.hidden = true;
    error.textContent = "";
    return;
  }
  error.hidden = false;
  error.textContent = message;
}

function atlasCollectLogicImportChoices() {
  const sources = {};
  document.querySelectorAll("[data-import-source]").forEach((select) => {
    const source = atlasLogicImportFindSource(select.value);
    if (source) sources[select.dataset.importSource] = atlasLogicImportSourceChoice(source);
  });
  const fields = {};
  document.querySelectorAll("[data-import-field]").forEach((select) => {
    fields[select.dataset.importField] = select.value;
  });
  const controls = {};
  document.querySelectorAll("[data-import-control]").forEach((control) => {
    controls[control.dataset.importControl] = control.value;
  });
  return { sources, fields, controls };
}

function atlasLogicImportJoinIsUnion(draft, choices) {
  const selected = choices?.controls?.join_type || draft?.params?.join_type || "";
  return String(selected).toUpperCase() === "UNION";
}

function atlasLogicImportMissingMessage(draft, choices) {
  if (!draft?.ok) return "Read a logic sentence to continue.";
  const union = atlasLogicImportJoinIsUnion(draft, choices);
  for (const control of draft.controls || []) {
    if (!control.required) continue;
    const value = choices.controls?.[control.id] ?? control.value;
    if (!String(value || "").trim()) return `Enter a value for ${control.label}.`;
  }
  for (const reference of draft.references || []) {
    if (union && reference.requiresJoinFields) continue;
    if (reference.kind === "source" && !choices.sources?.[reference.id])
      return `Choose a source for "${reference.token}".`;
    if (reference.kind === "field" && !String(choices.fields?.[reference.id] || "").trim())
      return `Choose a column for "${reference.token}".`;
  }
  return "";
}

function atlasLogicImportRefreshAddState() {
  const button = document.querySelector("[data-logic-import-add]");
  const reason = document.getElementById("logicImportAddReason");
  const draft = atlasLogicImportState?.draft;
  const choices = draft?.ok ? atlasCollectLogicImportChoices() : { sources: {}, fields: {}, controls: {} };
  const message = atlasLogicImportMissingMessage(draft, choices);
  if (button) button.disabled = Boolean(message);
  if (reason) reason.textContent = message;
}

function atlasLogicImportCssEscape(value) {
  const text = String(value || "");
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function")
    return CSS.escape(text);
  return text.replace(/["\\]/g, "\\$&");
}

function atlasLogicImportSourceColor(source) {
  if (!source || typeof source !== "object") return "";
  if (source.color) return String(source.color);
  if (typeof atlasSelectedSourceColor === "function")
    return String(atlasSelectedSourceColor(source) || "");
  return "";
}

function atlasLogicImportRaisePicker() {
  const host = document.getElementById("atlas-visual-picker-root");
  if (host) host.style.zIndex = "10400";
}

function atlasLogicImportLowerPicker() {
  const host = document.getElementById("atlas-visual-picker-root");
  if (host) host.style.removeProperty("z-index");
}

function atlasLogicImportPickerCaption(kind, value, source) {
  if (kind === "field") {
    if (!source)
      return { label: "Use a source to choose a column", detail: "", color: "" };
    const color = atlasLogicImportSourceColor(source);
    if (!value) return { label: "Choose column", detail: "", color };
    const field = (source.fields || []).find((item) => {
      const name = item.fieldName || item.rawFieldName || item.name || "";
      return name === value;
    });
    const vanity = field?.vanityLabel || field?.label || "";
    return {
      label: value,
      detail: vanity && vanity !== value ? String(vanity) : "",
      color,
    };
  }
  if (!value || !source)
    return {
      label: kind === "library" ? "Choose library source" : "Choose source",
      detail: "",
      color: "",
    };
  return {
    label: atlasLogicImportSourceLabel(source),
    detail: "",
    color: atlasLogicImportSourceColor(source),
  };
}

function atlasLogicImportPickerAria(slotLabel, caption, value) {
  if (!value) return slotLabel || caption.label;
  if (!slotLabel || slotLabel === caption.label) return caption.label;
  return `${slotLabel}: ${caption.label}`;
}

function atlasLogicImportPickerButtonHtml({
  kind,
  targetId,
  value,
  source,
  sourceRef = "",
  ariaLabel,
  disabled = false,
  hiddenAttribute,
}) {
  const caption = atlasLogicImportPickerCaption(kind, value, disabled ? null : source);
  const empty = !value || disabled;
  const showColor = Boolean(caption.color) && !empty;
  const tokenClass = kind === "field" ? "field-token" : "source-token";
  return `<button type="button" class="visual-picker-trigger-button ${tokenClass}${empty ? " empty" : ""}" data-logic-import-picker="${atlasImportEsc(kind)}" data-logic-import-target="${atlasImportEsc(targetId)}" data-logic-import-slot="${atlasImportEsc(ariaLabel)}"${sourceRef ? ` data-source-ref="${atlasImportEsc(sourceRef)}"` : ""} aria-label="${atlasImportEsc(atlasLogicImportPickerAria(ariaLabel, caption, value))}"${disabled ? " disabled" : ""}${showColor ? ` style="--source-color:${atlasImportEsc(caption.color)}"` : ""}>${showColor ? '<span class="source-color-dot" aria-hidden="true"></span>' : ""}<span class="visual-picker-trigger-copy"><strong>${atlasImportEsc(caption.label)}</strong>${caption.detail ? `<small>${atlasImportEsc(caption.detail)}</small>` : ""}</span><span aria-hidden="true">⌄</span></button><input type="hidden" ${hiddenAttribute} value="${atlasImportEsc(value || "")}">`;
}

function atlasLogicImportPaintPickerButton(button, kind, value, source) {
  if (!button) return;
  const caption = atlasLogicImportPickerCaption(kind, value, button.disabled ? null : source);
  const showColor = Boolean(caption.color) && !button.disabled && Boolean(value);
  button.classList.toggle("empty", !value || button.disabled);
  if (showColor) button.style.setProperty("--source-color", caption.color);
  else button.style.removeProperty("--source-color");
  const dot = button.querySelector(".source-color-dot");
  if (showColor && !dot) {
    const marker = document.createElement("span");
    marker.className = "source-color-dot";
    marker.setAttribute("aria-hidden", "true");
    button.prepend(marker);
  } else if (!showColor && dot) dot.remove();
  button.setAttribute(
    "aria-label",
    atlasLogicImportPickerAria(button.dataset.logicImportSlot || "", caption, value),
  );
  const copy = button.querySelector(".visual-picker-trigger-copy");
  if (!copy) return;
  let strong = copy.querySelector("strong");
  if (!strong) {
    strong = document.createElement("strong");
    copy.prepend(strong);
  }
  strong.textContent = caption.label;
  let detail = copy.querySelector("small");
  if (caption.detail) {
    if (!detail) {
      detail = document.createElement("small");
      copy.append(detail);
    }
    detail.textContent = caption.detail;
  } else if (detail) detail.remove();
}

function atlasLogicImportDescribedSourceLabel(source, sourceKey) {
  const sourceFile = source.sourceFile || source.name || sourceKey;
  const sourceAlias = source.alias || source.sourceKey || sourceFile;
  if (typeof atlasSourceDisambiguatedLabel === "function") {
    const label = atlasSourceDisambiguatedLabel({
      sourceFile,
      alias: sourceAlias,
      sourceKey,
      sourceMetadata: source.sourceMetadata || { sourceTitle: sourceFile },
    });
    if (label) return { label, sourceFile, sourceAlias };
  }
  return {
    label: atlasLogicImportSourceLabel(source),
    sourceFile,
    sourceAlias,
  };
}

function atlasLogicImportSourceEntries(sources, groupLabel) {
  return (sources || [])
    .map((source) => {
      const sourceKey = atlasLogicImportSourceChoice(source).sourceKey;
      if (!sourceKey) return null;
      const described = atlasLogicImportDescribedSourceLabel(source, sourceKey);
      return {
        key: sourceKey,
        label: described.label,
        rawName: described.label,
        detail:
          described.sourceAlias && described.sourceAlias !== described.sourceFile
            ? described.sourceAlias
            : "",
        sourceKey,
        sourceLabel: groupLabel,
        sourceColor: atlasLogicImportSourceColor(source) || "#7da2d8",
        custom: false,
        badge: "",
        pickerValue: sourceKey,
        pickerSource: sourceKey,
      };
    })
    .filter(Boolean);
}

function atlasLogicImportFieldEntries(source) {
  if (!source) return [];
  const sourceKey = atlasLogicImportSourceChoice(source).sourceKey;
  const described = atlasLogicImportDescribedSourceLabel(source, sourceKey);
  const sourceColor = atlasLogicImportSourceColor(source) || "#7da2d8";
  return (source.fields || [])
    .map((field) => {
      const fieldName =
        field.fieldName || field.rawFieldName || field.name || field.label || "";
      if (!fieldName) return null;
      const vanity =
        field.auditSpecificVanityLabel ||
        field.vanityLabel ||
        field.globalVanityLabel ||
        field.label ||
        "";
      return {
        key: `${sourceKey}::${fieldName}`,
        label: vanity || fieldName,
        rawName: fieldName,
        detail: "",
        sourceKey,
        sourceLabel: described.label,
        sourceColor,
        custom: Boolean(field.isCreatedField || field.custom),
        badge: field.isCreatedField ? "Custom" : "",
        pickerValue: fieldName,
        pickerSource: sourceKey,
      };
    })
    .filter(Boolean);
}

function atlasLogicImportOpenPicker(button) {
  if (!button || button.disabled) return;
  const picker = typeof window !== "undefined" ? window.ATLASVisualPicker : null;
  if (typeof picker?.open !== "function") {
    atlasLogicImportShowError(
      "The visual picker is unavailable. Reload the page and try again.",
    );
    return;
  }
  const kind = button.dataset.logicImportPicker || "source";
  const input = button.parentElement?.querySelector(
    "[data-import-source], [data-import-field], [data-logic-import-library]",
  );
  if (!input) return;
  let entries = [];
  let selectable = [];
  let mode = "source";
  let title = "Choose Selected Source File";
  let guidance = "Only sources selected for this audit are available here.";
  if (kind === "field") {
    mode = "field";
    title = "Choose Field";
    guidance = "Fields from the source chosen for this file are available here.";
    const sourceInput = document.querySelector(
      `[data-import-source="${atlasLogicImportCssEscape(button.dataset.sourceRef || "")}"]`,
    );
    const source = atlasLogicImportFindSource(sourceInput?.value || "");
    if (!source) return;
    selectable = [source];
    entries = atlasLogicImportFieldEntries(source);
  } else if (kind === "library") {
    title = "Choose Library Source";
    guidance = "Choose the library source that matches this file.";
    const suggestions = atlasSuggestLogicImportMappings(
      atlasLogicImportState?.draft,
      atlasLogicImportCatalogs(),
    );
    const reference = suggestions.find(
      (item) => item.id === button.dataset.logicImportTarget,
    );
    selectable = reference?.matches || [];
    entries = atlasLogicImportSourceEntries(selectable, "Library");
  } else {
    selectable = atlasLogicImportSelectedSources();
    entries = atlasLogicImportSourceEntries(selectable, "Selected Sources");
  }
  const selected = entries.find((entry) => entry.pickerValue === input.value);
  atlasLogicImportRaisePicker();
  const opened = picker.open({
    mode,
    title,
    guidance,
    searchPlaceholder: "Search selected sources and fields...",
    hideLabelMode: mode !== "field",
    entries,
    sort:
      typeof atlasFieldPickerSortMode === "string"
        ? atlasFieldPickerSortMode
        : "source",
    selectedKey: selected?.key || null,
    onSelect(entry) {
      if (!entry) return;
      const next = String(entry.pickerValue || "");
      input.value = next;
      const nextSource =
        kind === "field"
          ? selectable[0]
          : selectable.find(
              (item) => atlasLogicImportSourceChoice(item).sourceKey === next,
            ) || null;
      atlasLogicImportPaintPickerButton(button, kind, next, nextSource);
      if (kind === "source") atlasLogicImportFillFields(input);
      else atlasLogicImportRefreshAddState();
    },
    onClose() {
      atlasLogicImportLowerPicker();
    },
  });
  if (!opened) atlasLogicImportLowerPicker();
}

function atlasRenderLogicImportMapping() {
  const mount = document.getElementById("logicImportMapping");
  const draft = atlasLogicImportState?.draft;
  if (!mount || !draft?.ok) {
    if (mount) mount.innerHTML = "";
    atlasLogicImportRefreshAddState();
    return;
  }
  const catalogs = atlasLogicImportCatalogs();
  const suggestions = atlasSuggestLogicImportMappings(draft, catalogs);
  const rows = suggestions
    .map((reference) => {
      if (reference.kind === "source") {
        const declined = atlasLogicImportState.declined.has(reference.id);
        const currentSource = reference.status === "in-use" ? reference.source : null;
        const current = currentSource
          ? atlasLogicImportSourceChoice(currentSource).sourceKey
          : "";
        let prompt = "";
        if (!declined && reference.status === "library" && reference.source) {
          const choice = atlasLogicImportSourceChoice(reference.source);
          prompt = `<div class="logic-import-use-prompt"><p>Add "${atlasImportEsc(reference.token)}" to this audit?</p><button type="button" class="btn primary" data-logic-import-use="${atlasImportEsc(choice.sourceKey)}">Use source</button><button type="button" class="btn secondary" data-logic-import-decline="${atlasImportEsc(reference.id)}">Don't add</button></div>`;
        } else if (!declined && reference.status === "ambiguous-library") {
          const matches = reference.matches || [];
          const librarySource = matches[0] || null;
          const libraryKey = librarySource
            ? atlasLogicImportSourceChoice(librarySource).sourceKey
            : "";
          prompt = `<div class="logic-import-use-prompt"><p>"${atlasImportEsc(reference.token)}" matches more than one library source. Choose one to add.</p><label>Library source${atlasLogicImportPickerButtonHtml({ kind: "library", targetId: reference.id, value: libraryKey, source: librarySource, ariaLabel: `Library source for ${reference.token}`, hiddenAttribute: `data-logic-import-library="${atlasImportEsc(reference.id)}"` })}</label><button type="button" class="btn primary" data-logic-import-use-choice="${atlasImportEsc(reference.id)}">Use source</button><button type="button" class="btn secondary" data-logic-import-decline="${atlasImportEsc(reference.id)}">Don't add</button></div>`;
        } else if (reference.status === "unknown") {
          prompt = `<p class="logic-import-warning">"${atlasImportEsc(reference.token)}" is not in the source library, so it cannot be added. Choose a source already in use.</p>`;
        } else if (reference.status === "ambiguous-in-use") {
          prompt = `<p class="logic-import-warning">"${atlasImportEsc(reference.token)}" matches more than one source already in use. Choose the source to use.</p>`;
        }
        return `<section class="logic-import-row"><div class="logic-import-token"><span>${atlasImportEsc(reference.label)}</span><strong>${atlasImportEsc(reference.token)}</strong></div><label>Source${atlasLogicImportPickerButtonHtml({ kind: "source", targetId: reference.id, value: current, source: currentSource, ariaLabel: `Source for ${reference.token}`, hiddenAttribute: `data-import-source="${atlasImportEsc(reference.id)}"` })}</label>${prompt}</section>`;
      }
      if (reference.kind === "field") {
        const sourceSuggestion = suggestions.find((item) => item.id === reference.sourceRefId);
        const source =
          sourceSuggestion?.status === "in-use" ? sourceSuggestion.source : null;
        const selected = source && reference.status === "matched" ? reference.fieldName : "";
        return `<section class="logic-import-row"><div class="logic-import-token"><span>${atlasImportEsc(reference.label)}</span><strong>${atlasImportEsc(reference.token)}</strong></div><label>Column${atlasLogicImportPickerButtonHtml({ kind: "field", targetId: reference.id, value: selected, source, sourceRef: reference.sourceRefId || "", ariaLabel: `Column for ${reference.token}`, disabled: !source, hiddenAttribute: `data-import-field="${atlasImportEsc(reference.id)}" data-source-ref="${atlasImportEsc(reference.sourceRefId || "")}"` })}</label></section>`;
      }
      return "";
    })
    .join("");
  const controls = (draft.controls || [])
    .map((control) => {
      if (control.kind === "select") {
        const options = (control.options || [])
          .map(
            (option) =>
              `<option value="${atlasImportEsc(option)}" ${option === control.value ? "selected" : ""}>${atlasImportEsc(option)}</option>`,
          )
          .join("");
        return `<label class="logic-import-control">${atlasImportEsc(control.label)}<select data-import-control="${atlasImportEsc(control.id)}">${options}</select></label>`;
      }
      if (control.kind === "values") {
        return `<label class="logic-import-control">${atlasImportEsc(control.label)}<textarea data-import-control="${atlasImportEsc(control.id)}" rows="3">${atlasImportEsc(control.value)}</textarea></label>`;
      }
      return `<label class="logic-import-control">${atlasImportEsc(control.label)}<input data-import-control="${atlasImportEsc(control.id)}" value="${atlasImportEsc(control.value)}"></label>`;
    })
    .join("");
  mount.innerHTML = `<p class="logic-import-type">Read as <strong>${atlasImportEsc(draft.title)}</strong></p>${rows}${controls ? `<div class="logic-import-controls">${controls}</div>` : ""}`;
  atlasLogicImportRefreshAddState();
}

function atlasReadLogicImportText() {
  const text = document.getElementById("logicImportText")?.value || "";
  atlasLogicImportState.text = text;
  atlasLogicImportState.declined = new Set();
  const draft = atlasParseImportedLogicText(text);
  atlasLogicImportState.draft = draft.ok ? draft : null;
  atlasLogicImportShowError(draft.ok ? "" : draft.message);
  const mount = document.getElementById("logicImportMapping");
  if (!draft.ok && mount) mount.innerHTML = "";
  if (draft.ok) atlasRenderLogicImportMapping();
  else atlasLogicImportRefreshAddState();
}

function atlasLogicImportRememberControlEdits() {
  const draft = atlasLogicImportState?.draft;
  if (!draft?.ok) return;
  document.querySelectorAll("[data-import-control]").forEach((control) => {
    const match = draft.controls.find((item) => item.id === control.dataset.importControl);
    if (match) match.value = control.value;
  });
}

function atlasUseImportedLogicSource(sourceKey) {
  if (typeof atlasAuditIsWorkflowLocked === "function" && atlasAuditIsWorkflowLocked()) {
    status?.("This audit is read-only while approval is pending.", "bad");
    return;
  }
  if (typeof atlasCommitAuditSourceChange !== "function") {
    atlasLogicImportShowError("This source could not be added from the import dialog.");
    return;
  }
  const result = atlasCommitAuditSourceChange({
    action: "add",
    sourceKeyOrFile: sourceKey,
  });
  if (!result?.changed && result?.reason === "not-found") {
    atlasLogicImportShowError(
      `"${sourceKey}" is not in the source library, so it cannot be added.`,
    );
    return;
  }
  atlasLogicImportRememberControlEdits();
  atlasRenderLogicImportMapping();
}

function atlasCommitLogicImport() {
  const draft = atlasLogicImportState?.draft;
  if (!draft?.ok) return;
  if (typeof atlasAuditIsWorkflowLocked === "function" && atlasAuditIsWorkflowLocked()) {
    status?.("This audit is read-only while approval is pending.", "bad");
    return;
  }
  const choices = atlasCollectLogicImportChoices();
  const missing = atlasLogicImportMissingMessage(draft, choices);
  if (missing) {
    atlasLogicImportShowError(missing);
    atlasLogicImportRefreshAddState();
    return;
  }
  const built = atlasImportMaterialize(draft, choices);
  if (!built.ok) {
    atlasLogicImportShowError(built.message);
    return;
  }
  if (built.referenceOnly) {
    const step = (state.audit.steps || []).find((item) => {
      if (!item.autoGeneratedReference && item.step_type !== "reference_source")
        return false;
      const params = item.params || {};
      const keys = [item.source, params.source_file, params.source_alias, params.source_key];
      return keys.some((value) => {
        const normalized = atlasLogicImportNormalize(value);
        return (
          normalized &&
          [
            built.sourceKey,
            built.sourceFile,
            built.sourceAlias,
          ].some((candidate) => atlasLogicImportNormalize(candidate) === normalized)
        );
      });
    });
    if (!step) {
      atlasLogicImportShowError(
        "Use the source on this audit before opening its reference step.",
      );
      return;
    }
    state.selectedStepId = step.id;
    atlasRequestStructuralStepRender?.();
    status?.(
      `${built.label} is already on this audit. Its reference step is selected.`,
      "ok",
    );
    atlasCloseLogicImportDialog();
    return;
  }
  built.step.id = typeof uid === "function" ? uid("step") : `step_${Date.now()}`;
  if (built.step.step_type === "if_then") {
    const conditions = JSON.parse(built.step.params.conditions_json || "[]");
    conditions.forEach((condition) => {
      if (!condition.id || String(condition.id).startsWith("cond_"))
        condition.id = typeof uid === "function" ? uid("cond") : condition.id;
    });
    built.step.params.conditions_json = JSON.stringify(conditions);
    built.step.conditions = conditions.map((condition) => ({
      id: condition.id,
      field: condition.fieldName,
      operator: condition.operator,
      value: condition.compareValue,
    }));
  }
  normalizeCatalogStep?.(built.step);
  const steps = state.audit.steps || [];
  steps.push(built.step);
  state.audit.steps = steps;
  if (typeof atlasReindexManualRules === "function") atlasReindexManualRules();
  else built.step.sortOrder = steps.length;
  state.selectedStepId = built.step.id;
  atlasRequestStructuralStepRender?.();
  scheduleAutosave?.();
  status?.(`Added ${built.step.title} from text.`, "ok");
  atlasCloseLogicImportDialog();
}

function atlasLogicImportFillFields(sourceInput) {
  const source = atlasLogicImportFindSource(sourceInput.value);
  const refId = atlasLogicImportCssEscape(sourceInput.dataset.importSource || "");
  document
    .querySelectorAll(`[data-import-field][data-source-ref="${refId}"]`)
    .forEach((fieldInput) => {
      const button = fieldInput.parentElement?.querySelector(
        '[data-logic-import-picker="field"]',
      );
      const draft = atlasLogicImportState?.draft;
      const reference = draft?.references?.find(
        (item) => item.id === fieldInput.dataset.importField,
      );
      const suggestion = source
        ? atlasSuggestLogicImportField(reference?.token || "", source)
        : { fieldName: "" };
      fieldInput.value = source ? suggestion.fieldName || "" : "";
      if (button) {
        button.disabled = !source;
        atlasLogicImportPaintPickerButton(button, "field", fieldInput.value, source);
      }
    });
  atlasLogicImportRefreshAddState();
}

function atlasLogicImportOnClick(event) {
  const target = event.target?.closest ? event.target : event.target?.parentElement;
  if (!target?.closest) return;
  if (target.closest("#importLogicTextBtn")) {
    event.preventDefault();
    atlasOpenLogicImportDialog();
    return;
  }
  const root = document.querySelector("[data-logic-import-root]");
  if (!root || !root.contains(target)) return;
  const pickerButton = target.closest("[data-logic-import-picker]");
  if (pickerButton) {
    event.preventDefault();
    atlasLogicImportOpenPicker(pickerButton);
    return;
  }
  if (target.closest("[data-logic-import-close]") || target === root) {
    event.preventDefault();
    atlasCloseLogicImportDialog();
    return;
  }
  if (target.closest("[data-logic-import-read]")) {
    event.preventDefault();
    atlasReadLogicImportText();
    return;
  }
  if (target.closest("[data-logic-import-add]")) {
    event.preventDefault();
    atlasCommitLogicImport();
    return;
  }
  const use = target.closest("[data-logic-import-use]");
  if (use) {
    event.preventDefault();
    atlasUseImportedLogicSource(use.dataset.logicImportUse || "");
    return;
  }
  const choice = target.closest("[data-logic-import-use-choice]");
  if (choice) {
    event.preventDefault();
    const select = root.querySelector(
      `[data-logic-import-library="${choice.dataset.logicImportUseChoice}"]`,
    );
    atlasUseImportedLogicSource(select?.value || "");
    return;
  }
  const decline = target.closest("[data-logic-import-decline]");
  if (decline) {
    event.preventDefault();
    atlasLogicImportRememberControlEdits();
    atlasLogicImportState?.declined.add(decline.dataset.logicImportDecline || "");
    atlasRenderLogicImportMapping();
  }
}

function atlasLogicImportOnChange(event) {
  const root = document.querySelector("[data-logic-import-root]");
  if (!root || !root.contains(event.target)) return;
  if (event.target.matches?.("[data-import-source]")) {
    atlasLogicImportFillFields(event.target);
    return;
  }
  if (event.target.matches?.("[data-import-control], [data-import-field]"))
    atlasLogicImportRefreshAddState();
}

function atlasLogicImportOnKeydown(event) {
  const root = document.querySelector("[data-logic-import-root]");
  if (!root) return;
  if (event.key === "Escape") {
    if (event.defaultPrevented) return;
    event.preventDefault();
    atlasCloseLogicImportDialog();
    return;
  }
  if (event.key !== "Tab" || event.defaultPrevented) return;
  const focusable = [...root.querySelectorAll("button, textarea, select, input")].filter(
    (node) => !node.disabled && node.offsetParent !== null,
  );
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable.at(-1);
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

if (typeof document !== "undefined") {
  document.addEventListener("click", atlasLogicImportOnClick);
  document.addEventListener("change", atlasLogicImportOnChange);
  document.addEventListener("keydown", atlasLogicImportOnKeydown);
}

globalThis.atlasParseImportedLogicText = atlasParseImportedLogicText;
globalThis.atlasClassifyLogicImportSource = atlasClassifyLogicImportSource;
globalThis.atlasSuggestLogicImportField = atlasSuggestLogicImportField;
globalThis.atlasSuggestLogicImportMappings = atlasSuggestLogicImportMappings;
globalThis.atlasImportMaterialize = atlasImportMaterialize;
