/** No wallet movement — but not “empty” if the API returned completed earnings rows (e.g. all R0). */
export function cleanerEarningsFullyEmpty(
  s: {
    pending_cents: number;
    eligible_cents: number;
    paid_cents: number;
    invalid_cents?: number;
  },
  opts?: { completedEarningsRowCount?: number },
): boolean {
  const n = opts?.completedEarningsRowCount;
  if (typeof n === "number" && n > 0) return false;
  const inv = Math.round(Number(s.invalid_cents) || 0);
  return (
    inv === 0 &&
    Math.round(Number(s.pending_cents) || 0) === 0 &&
    Math.round(Number(s.eligible_cents) || 0) === 0 &&
    Math.round(Number(s.paid_cents) || 0) === 0
  );
}
