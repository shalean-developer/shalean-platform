/** One rule: no completed-job earnings in any payout bucket. */
export function cleanerEarningsFullyEmpty(s: {
  pending_cents: number;
  eligible_cents: number;
  paid_cents: number;
  invalid_cents?: number;
}): boolean {
  const inv = Math.round(Number(s.invalid_cents) || 0);
  return (
    inv === 0 &&
    Math.round(Number(s.pending_cents) || 0) === 0 &&
    Math.round(Number(s.eligible_cents) || 0) === 0 &&
    Math.round(Number(s.paid_cents) || 0) === 0
  );
}
