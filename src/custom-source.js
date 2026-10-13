export const CUSTOM_FIELD_FORMATS = Object.freeze([
  "Text",
  "Number",
  "Decimal",
  "Date",
  "Date/Time",
  "Boolean",
  "Currency",
]);

const NAME_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} .,&'’_:/()+-]*$/u;
const MAX_FIELDS = 200;

export class CustomSourceValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "CustomSourceValidationError";
    this.status = 400;
  }
}

function cleanText(value, { label, max, required, allowNewlines = false }) {
  if (value == null) value = "";
  if (typeof value !== "string") {
    throw new CustomSourceValidationError(`${label} must be text.`);
  }
  const trimmed = value.trim();
  if (required && !trimmed) {
    throw new CustomSourceValidationError(`${label} is required.`);
  }
  if (trimmed.length > max) {
    throw new CustomSourceValidationError(
      `${label} must be ${max} characters or fewer.`,
    );
  }
  const controls = allowNewlines
    ? /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/
    : /[\u0000-\u001F\u007F]/;
  if (controls.test(trimmed)) {
    throw new CustomSourceValidationError(
      `${label} contains characters that cannot be stored.`,
    );
  }
  return trimmed;
}

function cleanName(value, { label, max, required }) {
  const text = cleanText(value, { label, max, required });
  if (text && !NAME_PATTERN.test(text)) {
    throw new CustomSourceValidationError(
      `${label} can use letters, numbers, spaces, and . , & ' - _ ( ) : / +.`,
    );
  }
  return text;
}

/**
 * Builds a unique custom.* key from the source name.
 * @param {string} sourceName
 * @param {Iterable<string>} takenKeys
 */
export function allocateCustomSourceKey(sourceName, takenKeys) {
  const taken = takenKeys instanceof Set ? takenKeys : new Set(takenKeys);
  const slug = String(sourceName || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  const stem = `custom.${slug || "source"}`;
  if (!taken.has(stem)) return stem;
  for (let suffix = 2; suffix < 10000; suffix += 1) {
    const key = `${stem}-${suffix}`;
    if (!taken.has(key)) return key;
  }
  throw new CustomSourceValidationError(
    "A source with this name already exists. Change the source name and try again.",
  );
}

/**
 * Copies the signed-in user's name. Client-supplied creator fields are ignored.
 * @param {{ id?: string, username?: string, fullName?: string }} user
 */
export function customSourceCreator(user) {
  const id = String(user?.id || "").trim();
  const username = String(user?.username || "").trim();
  const fullName = String(user?.fullName || "").trim() || username;
  if (
    !id ||
    !username ||
    !fullName ||
    id.length > 200 ||
    username.length > 200 ||
    fullName.length > 200
  ) {
    throw new CustomSourceValidationError(
      "Your account name could not be saved with this source. Sign in again and retry.",
    );
  }
  return { id, username, fullName };
}

export function validateCustomSourceInput(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new CustomSourceValidationError("Custom source details are required.");
  }
  const sourceName = cleanName(body.sourceName, {
    label: "Source name",
    max: 200,
    required: true,
  });
  const sourceSystem = cleanName(body.sourceSystem, {
    label: "Source system",
    max: 120,
    required: false,
  });
  if (!Array.isArray(body.fields) || body.fields.length === 0) {
    throw new CustomSourceValidationError("Add at least one field.");
  }
  if (body.fields.length > MAX_FIELDS) {
    throw new CustomSourceValidationError(
      `A custom source can include at most ${MAX_FIELDS} fields.`,
    );
  }
  const fields = body.fields.map((field, index) => {
    const label = `Field ${index + 1}`;
    if (!field || typeof field !== "object" || Array.isArray(field)) {
      throw new CustomSourceValidationError(`${label} is missing its details.`);
    }
    const vanityLabel = cleanName(field.vanityLabel ?? field.displayName, {
      label: `${label} display name`,
      max: 200,
      required: true,
    });
    const rawName = cleanName(field.fieldName, {
      label: `${label} source field name`,
      max: 200,
      required: false,
    });
    const fieldFormat = cleanText(field.fieldFormat, {
      label: `${label} format`,
      max: 40,
      required: true,
    });
    if (!CUSTOM_FIELD_FORMATS.includes(fieldFormat)) {
      throw new CustomSourceValidationError(
        `${label} format must be one of: ${CUSTOM_FIELD_FORMATS.join(", ")}.`,
      );
    }
    const businessDescription = cleanText(field.businessDescription, {
      label: `${label} description`,
      max: 2000,
      required: false,
      allowNewlines: true,
    });
    return {
      fieldName: rawName || vanityLabel,
      vanityLabel,
      fieldFormat,
      businessDescription,
    };
  });
  return { sourceName, sourceSystem, fields };
}

export function safeAvatarUrl(value) {
  const avatar = String(value || "").trim();
  if (/^https:\/\//i.test(avatar)) return avatar;
  if (avatar.startsWith("/") && !avatar.startsWith("//")) return avatar;
  return null;
}

function emptyGovernance() {
  return {
    governanceOwner: "",
    lastValidatedDate: "",
    validationNotes: "",
  };
}

export function customSourceFromRecord(row) {
  const sourceKey = String(row.source_key || "").trim();
  const sourceName = String(row.source_name || "").trim();
  const fullName = String(row.created_by_full_name || "").trim();
  const fields = (Array.isArray(row.fields) ? row.fields : []).map(
    (field, index) => {
      const orderNumber = Number(field.field_order);
      const order =
        Number.isFinite(orderNumber) && orderNumber > 0
          ? orderNumber
          : index + 1;
      const fieldName = String(field.field_name || "");
      const vanityLabel = String(field.vanity_label || fieldName);
      return {
        id: String(field.id),
        order,
        sourceKey,
        fieldName,
        rawFieldName: fieldName,
        vanityLabel,
        label: vanityLabel,
        businessDescription: String(field.business_description || ""),
        uniqueFieldIdentifier: "",
        dataCategory: "",
        fieldFormat: String(field.field_format || ""),
        authorityType: "",
        sampleValues: [],
        fieldStatus: "",
        fieldType: "",
        maxCharacters: "",
        transformationLogic: "",
        translationLogic: "",
        matchingKeys: [],
        developerJoinNotes: "",
        developerNotes: "",
        schemaLocation: "",
        fieldOwner: "",
        systemOfRecord: "",
        downstreamImpact: "",
        governance: emptyGovernance(),
      };
    },
  );
  return {
    version: 2,
    sourceKey,
    sourceFile: sourceName,
    alias: sourceKey,
    origin: "custom",
    createdBy: {
      id: String(row.created_by_user_id || ""),
      username: String(row.created_by_username || ""),
      fullName,
      avatar: safeAvatarUrl(row.avatar_url),
    },
    sourceMetadata: {
      sourceSystem: String(row.source_system || ""),
      sourceTitle: sourceName,
      frequency: "",
      population: "",
      sourceFileFormat: "",
      sourceOwner: "",
    },
    fieldCount: fields.length,
    fields,
  };
}

export function mergeCustomSources(catalogSources, customSources) {
  const catalog = Array.isArray(catalogSources) ? catalogSources : [];
  const custom = Array.isArray(customSources) ? customSources : [];
  const taken = new Set(
    catalog.map((source) => String(source?.sourceKey || "").trim()).filter(Boolean),
  );
  const extras = [];
  for (const source of custom) {
    const key = String(source?.sourceKey || "").trim();
    if (!key || taken.has(key)) continue;
    taken.add(key);
    extras.push(source);
  }
  return [...catalog, ...extras].sort((left, right) =>
    String(left?.sourceFile || "").localeCompare(
      String(right?.sourceFile || ""),
      undefined,
      { sensitivity: "base", numeric: true },
    ),
  );
}
