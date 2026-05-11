import type { CleanerJobOffer } from "@/components/cleaner-dashboard/types";
import type { CleanerOfferRow } from "@/lib/cleaner/cleanerOfferRow";
import type { CleanerBookingRow } from "@/lib/cleaner/cleanerBookingRow";
import { cleanerBookingCardDetailsFromRow } from "@/lib/cleaner/cleanerBookingScopeSummary";
import { jobDateHeading } from "@/lib/cleaner/cleanerJobCardFormat";
import { suburbFromLocationForOffer } from "@/lib/cleaner/cleanerOfferLocationSuburb";
import { formatCleanerJobEarningsLabel } from "@/lib/cleaner/cleanerZarFormat";
import {
  cleanerJobEarningFromCents,
  resolveCleanerJobEarning,
  type CleanerJobEarning,
} from "@/lib/cleaner/cleanerJobEarning";

function bookingRowFromOfferBooking(b: NonNullable<CleanerOfferRow["booking"]>): CleanerBookingRow {
  return {
    id: b.id,
    service: b.service,
    date: b.date,
    time: b.time,
    location: b.location,
    customer_name: b.customer_name,
    customer_phone: b.customer_phone,
    status: b.status,
    total_paid_zar: typeof b.total_paid_zar === "number" ? b.total_paid_zar : null,
    assigned_at: null,
    en_route_at: null,
    started_at: null,
    completed_at: null,
    created_at: null,
    booking_snapshot: b.booking_snapshot ?? null,
    is_team_job: b.is_team_job === true,
    team_id: b.team_id ?? null,
    teamMemberCount: typeof b.teamMemberCount === "number" ? b.teamMemberCount : null,
  };
}

/**
 * Resolve the canonical {@link CleanerJobEarning} for an offer:
 *   1. Use the server-provided `jobEarning` field when present (preferred —
 *      reflects API-side preview fallback + data-integrity logging).
 *   2. Otherwise, derive from the legacy mirrored fields
 *      (`displayEarningsCents` / `earnings_cents`).
 *   3. Otherwise, derive from the embedded booking row earnings fields.
 * No new formula — all paths feed into {@link cleanerJobEarningFromCents} /
 * {@link resolveCleanerJobEarning}.
 */
function resolveOfferJobEarning(offer: CleanerOfferRow): CleanerJobEarning {
  if (offer.jobEarning) return offer.jobEarning;
  const mirrored = offer.displayEarningsCents ?? offer.earnings_cents;
  if (typeof mirrored === "number" && Number.isFinite(mirrored)) {
    return cleanerJobEarningFromCents(mirrored);
  }
  const b = offer.booking as
    | (NonNullable<CleanerOfferRow["booking"]> & {
        cleaner_earnings_total_cents?: unknown;
        payout_frozen_cents?: unknown;
        display_earnings_cents?: unknown;
      })
    | null;
  if (b) {
    return resolveCleanerJobEarning({
      cleaner_earnings_total_cents: b.cleaner_earnings_total_cents,
      payout_frozen_cents: b.payout_frozen_cents,
      display_earnings_cents: b.display_earnings_cents,
    });
  }
  return cleanerJobEarningFromCents(null);
}

export function mapOfferToDashboardCard(offer: CleanerOfferRow, now: Date): CleanerJobOffer {
  const jobEarning = resolveOfferJobEarning(offer);
  const isEstimateLabel =
    offer.earnings_estimated === true ||
    offer.displayEarningsIsEstimate === true ||
    offer.earnings_is_estimate === true;
  /**
   * Legacy compact label kept for backwards compatibility with any caller
   * still reading `payZarLabel`. New rendering uses {@link jobEarning} via
   * `formatCleanerJobEarningDisplay` to emit "Job earning: R___".
   */
  const payZarLabel =
    jobEarning.amount_cents != null
      ? formatCleanerJobEarningsLabel(jobEarning.amount_cents, { estimate: isEstimateLabel })
      : "—";

  const b = offer.booking;
  if (!b) {
    return {
      id: offer.id,
      serviceLabel: "Job offer",
      suburb: "Area on file",
      payZarLabel,
      jobEarning,
      scheduleLine: "—",
      dateLabel: undefined,
      timeLabel: undefined,
      bedrooms: null,
      bathrooms: null,
      expiresAt: offer.expires_at,
      offerToken: offer.offer_token?.trim() || undefined,
      offerCreatedAtIso: offer.created_at,
      smsSentAt: offer.sms_sent_at ?? null,
    };
  }

  const row = bookingRowFromOfferBooking(b);
  const det = cleanerBookingCardDetailsFromRow(row);
  const bedrooms = det.bedrooms;
  const bathrooms = det.bathrooms;
  const bed = bedrooms != null ? String(bedrooms) : "—";
  const bath = bathrooms != null ? String(bathrooms) : "—";
  const head = jobDateHeading(String(b.date ?? ""), now);
  const rawTime = (b.time ?? "").trim();
  const timeHm = rawTime || "—";
  // Structured pieces for icon-row rendering — keep `—` out of the chip
  // strings so the dispatch card doesn't render meaningless dashes between
  // icons. Components fall back to `scheduleLine` when these are absent.
  const dateLabel = head && head !== "Scheduled" ? head : undefined;
  const timeLabel = rawTime || undefined;
  const scheduleLine = `${head} • ${timeHm} • ${bed} bed • ${bath} bath`;

  return {
    id: offer.id,
    serviceLabel: (b.service ?? "Cleaning").trim() || "Cleaning",
    suburb: suburbFromLocationForOffer(b.location),
    payZarLabel,
    jobEarning,
    scheduleLine,
    dateLabel,
    timeLabel,
    bedrooms,
    bathrooms,
    expiresAt: offer.expires_at,
    uxVariant: offer.ux_variant ?? null,
    offerToken: offer.offer_token?.trim() || undefined,
    offerCreatedAtIso: offer.created_at,
    smsSentAt: offer.sms_sent_at ?? null,
  };
}
