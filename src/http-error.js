/** Creates an Error with an HTTP status and optional extra fields. */
export function fail(status, message, extra = {}) {
  return Object.assign(new Error(message), { status, ...extra });
}
