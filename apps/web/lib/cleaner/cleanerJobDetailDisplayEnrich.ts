import type { SupabaseClient } from "@supabase/supabase-js";
import type { CustomerBookingDetailLine } from "@/lib/booking/bookingV2CustomerDisplay";
import {
  accessNotesFromBookingRow,
  cleanDetailLinesFromServiceDetails,
  serviceLabelFromBookingRow,
} from "@/lib/booking/bookingV2CustomerDisplay";
import {
  readCustomerNameFromBookingSnapshot,
  resolveAdminBookingCustomerName,
  resolveAdminBookingCustomerPhone,
  resolveCustomerPhoneFromAuthAdmin,
  trimCustomerName,
  trimCustomerPhone,
} from "@/lib/admin/adminBookingCustomerContact";
import { bookingAppointmentIsoUtc, normalizeBookingServiceIdForPayout, resolveCanonicalCleanerPayout } from "@/lib/payout/canonicalCleanerPayout";
import { resolvePayoutBaseAndServiceFeeCents } from "@/lib/payout/calculateCleanerPayout";

/** Street + suburb for cleaner maps / address block (booking-v2 often stores them separately). */
export function formatCleanerJobLocationDisplay(input: {
  location?: string | null;
  suburb?: string | null;
  booking_snapshot?: unknown;
}): string | null {
  const street = String(input.location ?? "").trim();
  let suburb = String(input.suburb ?? "").trim();
  if (!suburb && input.booking_snapshot && typeof input.booking_snapshot === "object" && !Array.isArray(input.booking_snapshot)) {
    const snapSuburb = (input.booking_snapshot as { suburb?: unknown }).suburb;
    suburb = typeof snapSuburb === "string" ? snapSuburb.trim() : "";
  }
  if (street && suburb && !street.toLowerCase().includes(suburb.toLowerCase())) {
    return `${street}, ${suburb}`;
  }
  return street || suburb || null;
}

export async function resolveCleanerJobCustomerContact(
  admin: SupabaseClient,
  row: {
    customer_name?: string | null;
    customer_phone?: string | null;
    customer_email?: string | null;
    user_id?: string | null;
    phone?: string | null;
    booking_snapshot?: unknown;
  },
): Promise<{ customer_name: string | null; customer_phone: string | null }> {
  let customer_name =
    trimCustomerName(row.customer_name) ??
    readCustomerNameFromBookingSnapshot(row.booking_snapshot) ??
    null;
  let customer_phone = resolveAdminBookingCustomerPhone({
    customer_phone: row.customer_phone,
    phone: row.phone,
    bookingSnapshot: row.booking_snapshot,
  });

  const userId = String(row.user_id ?? "").trim();
  if (userId) {
    if (!customer_name) {
      const { data: profile } = await admin.from("user_profiles").select("full_name").eq("id", userId).maybeSingle();
      customer_name = trimCustomerName((profile as { full_name?: string | null } | null)?.full_name);
    }
    if (!customer_name || !customer_phone) {
      try {
        const { data: authUser } = await admin.auth.admin.getUserById(userId);
        const meta = authUser?.user?.user_metadata as { full_name?: string; phone?: string; whatsapp?: string } | undefined;
        if (!customer_name) customer_name = trimCustomerName(meta?.full_name);
        if (!customer_phone) {
          customer_phone = await resolveCustomerPhoneFromAuthAdmin(admin, userId);
        }
      } catch {
        // auth lookup is best-effort
      }
    }
    if (!customer_phone) {
      const { data: lastBookingPhoneRow } = await admin
        .from("bookings")
        .select("customer_phone, booking_snapshot")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(12);
      for (const row of lastBookingPhoneRow ?? []) {
        const fromCol = trimCustomerPhone((row as { customer_phone?: string | null }).customer_phone);
        if (fromCol) {
          customer_phone = fromCol;
          break;
        }
        const fromSnap = resolveAdminBookingCustomerPhone({
          bookingSnapshot: (row as { booking_snapshot?: unknown }).booking_snapshot,
        });
        if (fromSnap) {
          customer_phone = fromSnap;
          break;
        }
      }
    }
  }

  if (!customer_name) {
    customer_name =
      resolveAdminBookingCustomerName({
        customer_name: null,
        customerEmail: row.customer_email ?? null,
      }) || null;
    if (customer_name === "Customer") customer_name = null;
  }

  return { customer_name, customer_phone };
}

export function cleanerJobServiceDetailLines(row: {
  service_details?: unknown;
  booking_snapshot?: unknown;
}): CustomerBookingDetailLine[] {
  const fromCol = cleanDetailLinesFromServiceDetails(row.service_details);
  if (fromCol.length > 0) return fromCol;
  const snap = row.booking_snapshot;
  if (snap && typeof snap === "object" && !Array.isArray(snap)) {
    const details = (snap as { serviceDetails?: unknown }).serviceDetails;
    return cleanDetailLinesFromServiceDetails(details);
  }
  return [];
}

export function cleanerJobAccessDetailLines(row: {
  access_instructions?: string | null;
  gate_code?: string | null;
  parking_instructions?: string | null;
}): CustomerBookingDetailLine[] {
  return accessNotesFromBookingRow(row);
}

export function cleanerJobServiceTitle(row: {
  service?: string | null;
  service_slug?: string | null;
}): string | null {
  return serviceLabelFromBookingRow({
    service: row.service ?? null,
    service_slug: row.service_slug ?? null,
  });
}

/** Canonical solo preview when async persist-engine preview is unavailable (read-only). */
export function syncSoloCleanerDisplayEarningsPreviewCents(params: {
  record: Record<string, unknown>;
  cleanerJoinedAtIso: string;
}): number | null {
  const joined = String(params.cleanerJoinedAtIso ?? "").trim();
  if (!joined) return null;

  const { payoutBaseCents, serviceFeeCents } = resolvePayoutBaseAndServiceFeeCents({
    baseAmountCents: params.record.base_amount_cents as number | null | undefined,
    serviceFeeCents: params.record.service_fee_cents as number | null | undefined,
    totalPaidZar: params.record.total_paid_zar as number | null | undefined,
    amountPaidCents: (params.record.total_paid_cents ?? params.record.amount_paid_cents) as number | null | undefined,
    priceSnapshot: params.record.price_snapshot,
  });
  if (payoutBaseCents <= 0) return null;

  const snap = params.record.booking_snapshot;
  const date =
    typeof params.record.date === "string"
      ? params.record.date
      : snap && typeof snap === "object" && !Array.isArray(snap)
        ? String((snap as { date?: unknown }).date ?? "")
        : "";
  const time =
    typeof params.record.time === "string"
      ? params.record.time
      : snap && typeof snap === "object" && !Array.isArray(snap)
        ? String((snap as { time?: unknown }).time ?? "")
        : "";

  const appt =
    bookingAppointmentIsoUtc(date, time) ??
    (snap && typeof snap === "object" && !Array.isArray(snap)
      ? bookingAppointmentIsoUtc(
          String((snap as { date?: unknown }).date ?? ""),
          String((snap as { time?: unknown }).time ?? ""),
        )
      : null);

  const canonical = resolveCanonicalCleanerPayout({
    serviceId: normalizeBookingServiceIdForPayout(snap, typeof params.record.service === "string" ? params.record.service : null),
    serviceLabel: typeof params.record.service === "string" ? params.record.service : null,
    cleanerJoinedAtIso: joined,
    bookingAppointmentIsoUtc: appt,
    bookingValueCents: payoutBaseCents,
    isTeamJob: false,
    serviceFeeCents,
  });
  const cents = Math.floor(Number(canonical.displayEarningsCents) || 0);
  return cents > 0 ? cents : null;
}
