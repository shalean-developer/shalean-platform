import { optionalCentsFromDb } from "@/lib/cleaner/cleanerJobDisplayEarningsResolve";

/** Shared server-side projection for current policy earnings without summary JSON. */
export const CLEANER_EARNINGS_READ_SELECT =
  "earnings_policy, internal_earnings_cents, cleaner_payout_cents, cleaner_bonus_cents, payout_owner_cleaner_id, booking_cleaners ( cleaner_id ), booking_roster_member_payouts ( cleaner_id, payout_cents, bonus_cents )";

export function cleanerEarningsReadInputs(raw: Record<string, unknown>) {
  return {
    earnings_policy:raw.earnings_policy as string | null | undefined,
    internal_earnings_cents:raw.internal_earnings_cents as number | null | undefined,
    cleaner_payout_cents:(raw.cleaner_payout_cents ?? null) as number | null,
    cleaner_bonus_cents:raw.cleaner_bonus_cents as number | null | undefined,
    payout_owner_cleaner_id:(raw.payout_owner_cleaner_id ?? null) as string | null,
    booking_cleaners:raw.booking_cleaners as Array<{cleaner_id:string}> | null | undefined,
    booking_roster_member_payouts:raw.booking_roster_member_payouts as Array<{cleaner_id:string;payout_cents:number;bonus_cents:number}> | null | undefined,
  };
}

/** Legacy client fallbacks must use the viewer amount, never a header/peer amount. */
export function cleanerViewerMoneyFields(row: Record<string, unknown>, resolvedAmount: unknown) {
  const cents = optionalCentsFromDb(resolvedAmount);
  return {
    display_earnings_cents: cents,
    cleaner_earnings_total_cents: cents,
    payout_frozen_cents: row.payout_frozen_cents == null ? null : cents,
  };
}
