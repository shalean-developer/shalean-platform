/** Matches "(+extra time)" / "(+Extra Time)" suffixes sometimes embedded in booking extra labels. */
const EXTRA_TIME_SUFFIX_RE = /\s*\(\+extra\s*time\)/gi;

/**
 * Strips internal duration hints from extra labels for cleaner-facing UI.
 * Prefer calling this when building scope lists so all consumers stay consistent.
 */
export function stripExtraTimeSuffixFromDisplayLabel(raw: string): string {
  return raw.replace(EXTRA_TIME_SUFFIX_RE, "").replace(/\s{2,}/g, " ").trim();
}
