const PAYLOAD_PREVIEW_MAX = 500;

/** Safe, size-limited preview for logs (emails redacted). */
export function formatFailedJobPayloadPreview(payload: unknown): string {
  let s = "";
  try {
    s = typeof payload === "object" && payload !== null ? JSON.stringify(payload) : String(payload);
  } catch {
    return "[unserializable]";
  }
  s = s.replace(/\b[\w.%+-]+@[\w.-]+\.[A-Za-z]{2,}\b/gi, "[email]");
  if (s.length > PAYLOAD_PREVIEW_MAX) {
    return `${s.slice(0, PAYLOAD_PREVIEW_MAX)}…`;
  }
  return s;
}
