import type { CleanerJobOffer } from "@/components/cleaner-dashboard/types";
import type { CleanerOfferRow } from "@/lib/cleaner/cleanerOfferRow";
import type { CleanerBookingRow } from "@/lib/cleaner/cleanerBookingRow";
import { cleanerBookingCardDetailsFromRow } from "@/lib/cleaner/cleanerBookingScopeSummary";
import { jobDateHeading } from "@/lib/cleaner/cleanerJobCardFormat";
import { suburbFromLocationForOffer } from "@/lib/cleaner/cleanerOfferLocationSuburb";
import { formatZarFromCents } from "@/lib/cleaner/cleanerZarFormat";

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

export function mapOfferToDashboardCard(offer: CleanerOfferRow, now: Date): CleanerJobOffer {
  const cents = offer.displayEarningsCents ?? offer.earnings_cents;
  const payZarLabel =
    typeof cents === "number" && Number.isFinite(cents) ? formatZarFromCents(Math.max(0, cents)) : "—";

  const b = offer.booking;
  if (!b) {
    return {
      id: offer.id,
      serviceLabel: "Job offer",
      suburb: "Area on file",
      payZarLabel,
      scheduleLine: "—",
      expiresAt: offer.expires_at,
    };
  }

  const row = bookingRowFromOfferBooking(b);
  const det = cleanerBookingCardDetailsFromRow(row);
  const bed = det.bedrooms != null ? String(det.bedrooms) : "—";
  const bath = det.bathrooms != null ? String(det.bathrooms) : "—";
  const head = jobDateHeading(String(b.date ?? ""), now);
  const timeHm = (b.time ?? "—").trim() || "—";
  const scheduleLine = `${head} • ${timeHm} • ${bed} bed • ${bath} bath`;

  return {
    id: offer.id,
    serviceLabel: (b.service ?? "Cleaning").trim() || "Cleaning",
    suburb: suburbFromLocationForOffer(b.location),
    payZarLabel,
    scheduleLine,
    expiresAt: offer.expires_at,
    uxVariant: offer.ux_variant ?? null,
  };
}
