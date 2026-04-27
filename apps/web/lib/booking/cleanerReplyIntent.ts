/**
 * Normalizes cleaner inbound reply text for intent detection.
 * Lowercase, trim, collapse internal whitespace to single spaces.
 */
export function normalizeCleanerReplyText(raw: string): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/** Accept: exact "1", or whole-word yes / accept / ok (not "yesterday", not "okayish" via \bok\b). */
export function isAssignedBookingAcceptReply(normalized: string): boolean {
  const t = normalized.trim();
  if (t === "1") return true;
  if (/\byes\b/.test(t)) return true;
  if (/\baccept\b/.test(t)) return true;
  if (/\bok\b/.test(t)) return true;
  return false;
}

/** Decline: exact "2", or whole-word no / decline / reject. */
export function isAssignedBookingDeclineReply(normalized: string): boolean {
  const t = normalized.trim();
  if (t === "2") return true;
  if (/\bno\b/.test(t)) return true;
  if (/\bdecline\b/.test(t)) return true;
  if (/\breject\b/.test(t)) return true;
  return false;
}

/** Dispatch **offer** reply: `1` first, then yes / accept / ok (template CTA). */
export function isDispatchOfferAcceptReply(normalized: string): boolean {
  return isAssignedBookingAcceptReply(normalized);
}

/** Dispatch **offer** reply: `2` first, then no / decline (template CTA). */
export function isDispatchOfferDeclineReply(normalized: string): boolean {
  return isAssignedBookingDeclineReply(normalized);
}
