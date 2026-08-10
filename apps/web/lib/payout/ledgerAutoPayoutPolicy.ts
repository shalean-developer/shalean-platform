/**
 * The weekly `cleaner_payouts` rail is Shalean's canonical money-movement rail.
 *
 * The ledger disbursement rail remains available for controlled/manual recovery,
 * but its cron must be explicitly enabled to avoid attempting the same earnings
 * on both rails.
 */
export function isLedgerAutoPayoutEnabled(): boolean {
  return process.env.LEDGER_AUTO_PAYOUT_ENABLED?.trim().toLowerCase() === "true";
}
