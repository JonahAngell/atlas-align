/** Reads one JSON object out of a model reply, with one repair attempt. */
import { AI_STATUS } from "./client.js";

const REPAIR_PROMPT =
  "Your last reply was not valid JSON. Return one JSON object only, with no markdown and no other text.";

/** The object in `text`, or null when there isn't exactly one to read. */
export function parseJsonObject(text) {
  if (typeof text !== "string") return null;
  const unfenced = text
    .trim()
    .replace(/^```[a-z]*\s*/i, "")
    .replace(/```\s*$/, "");
  const start = unfenced.indexOf("{");
  const end = unfenced.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const value = JSON.parse(unfenced.slice(start, end + 1));
    return value && typeof value === "object" && !Array.isArray(value)
      ? value
      : null;
  } catch (_error) {
    return null;
  }
}

/**
 * A completion that must be a JSON object. With `textFallback`, a prose reply
 * becomes { reply: text } instead of a repair call (chat only).
 */
export async function completeJson(client, request, { textFallback } = {}) {
  const first = await client.complete(request);
  if (first.status !== AI_STATUS.ok) return { ...first, value: null };
  const value = parseJsonObject(first.text);
  if (value) return { ...first, value };
  if (textFallback)
    return { ...first, value: { reply: first.text.trim(), proposals: [] } };
  const repaired = await client.complete({
    ...request,
    messages: [
      ...request.messages,
      { role: "assistant", content: first.text },
      { role: "user", content: REPAIR_PROMPT },
    ],
  });
  if (repaired.status !== AI_STATUS.ok) return { ...repaired, value: null };
  const fixed = parseJsonObject(repaired.text);
  return fixed
    ? { ...repaired, value: fixed, repaired: true }
    : { ...repaired, status: AI_STATUS.invalid, value: null };
}
