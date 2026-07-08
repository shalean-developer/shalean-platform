import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  roomsLinesFromServiceDetails,
  serviceLabelFromBookingRow,
} from "@/lib/booking/bookingV2CustomerDisplay";
import { bookingServiceSlugFromBookingRow } from "@/lib/booking-v2/bookingV2ServiceSlug";
import { rebookBookUrlFromBookingRowWithToken } from "@/lib/booking-v2/rebookFromBookingRow";
import {
  customerRebookTokenSubjectForBooking,
  verifyCustomerRebookToken,
} from "@/lib/customer/customerRebookLinkToken";
import { loadCustomerBookingRowForUser } from "@/lib/customer/customerBookingsForUser";
import { buildCustomerBookingSelect } from "@/lib/dashboard/customerBookingSelect";
import { normalizeCustomerBookingRow } from "@/lib/dashboard/normalizeCustomerBookingRow";
import type { BookingRow } from "@/lib/dashboard/types";
import { resolveBookingOwnershipColumn } from "@/lib/customer/customerBookingsForUser";

export type RebookLastBookingSummary = {
  id: string;
  serviceLabel: string;
  serviceSlug: string;
  roomLines: string[];
  statusLabel: string;
  completedDateLabel: string;
  rebookUrl: string;
  isRegularCleaning: boolean;
  monthsSinceLastBooking: number | null;
};

export type RebookLandingContext = {
  identified: boolean;
  firstName: string | null;
  lastBooking: RebookLastBookingSummary | null;
  rebookToken: string | null;
  nudgeMessage: string | null;
};

function firstNameFromFullName(fullName: string | null | undefined): string | null {
  const trimmed = fullName?.trim();
  if (!trimmed) return null;
  return trimmed.split(/\s+/)[0] ?? null;
}

function formatCompletedDate(row: BookingRow): string {
  const raw = row.completed_at?.trim() || row.date?.trim();
  if (!raw) return "";
  const ymd = raw.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return raw;
  try {
    const d = new Date(`${ymd}T12:00:00`);
    return d.toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return ymd;
  }
}

function statusLabelFromRow(row: BookingRow): string {
  const status = (row.status ?? "").toLowerCase();
  if (status === "completed") return "Completed";
  if (status === "cancelled") return "Cancelled";
  if (status === "in_progress") return "In progress";
  return "Booked";
}

function monthsSince(isoOrYmd: string | null | undefined): number | null {
  if (!isoOrYmd?.trim()) return null;
  const ms = Date.parse(isoOrYmd);
  if (!Number.isFinite(ms)) return null;
  const diffMs = Date.now() - ms;
  if (diffMs < 0) return 0;
  return Math.floor(diffMs / (1000 * 60 * 60 * 24 * 30.44));
}

function nudgeMessageForMonths(months: number | null): string | null {
  if (months == null) return null;
  if (months >= 3) return "It looks like your last cleaning was over 3 months ago.";
  if (months >= 1) return "Time for another fresh clean?";
  return null;
}

function roomLinesFromBookingRow(row: BookingRow): string[] {
  const fromDetails = roomsLinesFromServiceDetails(row.service_details);
  if (fromDetails.length > 0) return fromDetails;
  const parts: string[] = [];
  if (typeof row.bedrooms === "number" && row.bedrooms > 0) {
    parts.push(`${row.bedrooms} bedroom${row.bedrooms === 1 ? "" : "s"}`);
  }
  if (typeof row.bathrooms === "number" && row.bathrooms > 0) {
    parts.push(`${row.bathrooms} bathroom${row.bathrooms === 1 ? "" : "s"}`);
  }
  return parts;
}

function buildLastBookingSummary(row: BookingRow, rebookToken: string | null): RebookLastBookingSummary {
  const serviceSlug = bookingServiceSlugFromBookingRow(row);
  const serviceLabel = serviceLabelFromBookingRow(row) ?? "Cleaning";
  const activityIso = row.completed_at?.trim() || row.date?.trim() || row.created_at;
  const months = monthsSince(activityIso);

  return {
    id: row.id,
    serviceLabel,
    serviceSlug,
    roomLines: roomLinesFromBookingRow(row),
    statusLabel: statusLabelFromRow(row),
    completedDateLabel: formatCompletedDate(row),
    rebookUrl: rebookToken
      ? rebookBookUrlFromBookingRowWithToken(row, rebookToken)
      : `/book/${serviceSlug}?rebook=${encodeURIComponent(row.id)}&step=2`,
    isRegularCleaning: serviceSlug === "regular-cleaning",
    monthsSinceLastBooking: months,
  };
}

async function loadProfileFirstName(admin: SupabaseClient, userId: string): Promise<string | null> {
  const { data } = await admin.from("user_profiles").select("full_name").eq("id", userId).maybeSingle();
  const fullName =
    data && typeof data === "object" && "full_name" in data
      ? (data as { full_name?: string | null }).full_name
      : null;
  return firstNameFromFullName(fullName);
}

async function loadLastBookingForUser(
  admin: SupabaseClient,
  userId: string,
  preferredBookingId?: string,
): Promise<BookingRow | null> {
  const ownershipColumn = await resolveBookingOwnershipColumn(admin);
  const select = buildCustomerBookingSelect(ownershipColumn);

  if (preferredBookingId) {
    const out = await loadCustomerBookingRowForUser(admin, userId, preferredBookingId);
    if (out.ok) return out.booking;
  }

  const { data, error } = await admin
    .from("bookings")
    .select(select)
    .eq(ownershipColumn, userId)
    .neq("status", "pending_payment")
    .neq("status", "payment_expired")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return normalizeCustomerBookingRow(data as BookingRow);
}

async function loadBookingByIdForToken(
  admin: SupabaseClient,
  bookingId: string,
  tokenSub: string,
): Promise<BookingRow | null> {
  const ownershipColumn = await resolveBookingOwnershipColumn(admin);
  const select = buildCustomerBookingSelect(ownershipColumn);
  const { data, error } = await admin.from("bookings").select(select).eq("id", bookingId).maybeSingle();
  if (error || !data) return null;

  const row = normalizeCustomerBookingRow(data as BookingRow);
  const ownerId = row.user_id?.trim() || row.customer_id?.trim() || "";

  if (tokenSub.startsWith("booking:")) {
    const expectedId = tokenSub.slice("booking:".length);
    if (expectedId !== bookingId) return null;
    return row;
  }

  if (ownerId && ownerId === tokenSub) return row;
  return null;
}

export async function loadRebookLandingContext(
  admin: SupabaseClient,
  token: string | null | undefined,
): Promise<RebookLandingContext> {
  const anonymous: RebookLandingContext = {
    identified: false,
    firstName: null,
    lastBooking: null,
    rebookToken: null,
    nudgeMessage: null,
  };

  if (!token?.trim()) return anonymous;

  const payload = verifyCustomerRebookToken(token.trim());
  if (!payload) return anonymous;

  const userId = payload.sub.startsWith("booking:") ? null : payload.sub;
  let lastBooking: BookingRow | null = null;

  if (payload.bid) {
    lastBooking = await loadBookingByIdForToken(admin, payload.bid, payload.sub);
  } else if (userId) {
    lastBooking = await loadLastBookingForUser(admin, userId);
  }

  const firstName = userId ? await loadProfileFirstName(admin, userId) : null;
  const summary = lastBooking ? buildLastBookingSummary(lastBooking, token.trim()) : null;

  return {
    identified: true,
    firstName,
    lastBooking: summary,
    rebookToken: token.trim(),
    nudgeMessage: summary ? nudgeMessageForMonths(summary.monthsSinceLastBooking) : null,
  };
}

export async function loadBookingForRebookPrefill(
  admin: SupabaseClient,
  bookingId: string,
  token: string,
): Promise<BookingRow | null> {
  const payload = verifyCustomerRebookToken(token);
  if (!payload || payload.bid !== bookingId) return null;
  return loadBookingByIdForToken(admin, bookingId, payload.sub);
}

export function rebookTokenSubjectFromBookingRow(row: BookingRow): string {
  const ownerId = row.user_id?.trim() || row.customer_id?.trim();
  if (ownerId) return ownerId;
  return customerRebookTokenSubjectForBooking(row.id);
}
