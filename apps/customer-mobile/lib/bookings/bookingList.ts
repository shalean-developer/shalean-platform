import { johannesburgNowParts } from "@shalean/utils";
import { canonicalDbBookingStatus } from "@shalean/types";
import type { CustomerBookingRow } from "@/services/types/customerBookings";

/** List excludes unpaid checkouts; they belong in payment recovery flows. */
export function isListableBooking(row: CustomerBookingRow): boolean {
  const status = canonicalDbBookingStatus(row.status);
  return status !== "pending_payment";
}

export function isPastBooking(row: CustomerBookingRow, todayYmd?: string): boolean {
  const today = todayYmd ?? johannesburgNowParts().ymd;
  const status = canonicalDbBookingStatus(row.status);
  if (status === "completed" || status === "cancelled" || status === "failed") {
    return true;
  }
  const date = String(row.date ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(date) && date < today) return true;
  return false;
}

export function splitBookingsBySegment(rows: CustomerBookingRow[]): {
  upcoming: CustomerBookingRow[];
  past: CustomerBookingRow[];
} {
  const today = johannesburgNowParts().ymd;
  const listable = rows.filter(isListableBooking);
  const upcoming: CustomerBookingRow[] = [];
  const past: CustomerBookingRow[] = [];
  for (const row of listable) {
    if (isPastBooking(row, today)) past.push(row);
    else upcoming.push(row);
  }
  const byDateDesc = (a: CustomerBookingRow, b: CustomerBookingRow) =>
    String(b.date ?? "").localeCompare(String(a.date ?? "")) ||
    String(b.time ?? "").localeCompare(String(a.time ?? ""));
  const byDateAsc = (a: CustomerBookingRow, b: CustomerBookingRow) =>
    String(a.date ?? "").localeCompare(String(b.date ?? "")) ||
    String(a.time ?? "").localeCompare(String(b.time ?? ""));
  upcoming.sort(byDateAsc);
  past.sort(byDateDesc);
  return { upcoming, past };
}

export function bookingCleanerLabel(row: CustomerBookingRow): string | null {
  const name =
    row.display_cleaner_name?.trim() ||
    row.payout_owner_cleaner_name?.trim() ||
    row.cleaners?.full_name?.trim() ||
    "";
  return name || null;
}

/** Display price from persisted fields only — never invent amounts. */
export function bookingDisplayPriceZar(row: CustomerBookingRow): number | null {
  if (typeof row.total_price === "number" && Number.isFinite(row.total_price)) {
    return row.total_price;
  }
  if (typeof row.total_price === "string" && row.total_price.trim()) {
    const n = Number(row.total_price);
    if (Number.isFinite(n)) return n;
  }
  if (typeof row.total_paid_zar === "number" && Number.isFinite(row.total_paid_zar)) {
    return row.total_paid_zar;
  }
  if (typeof row.amount_paid_cents === "number" && Number.isFinite(row.amount_paid_cents)) {
    return row.amount_paid_cents / 100;
  }
  return null;
}

export function durationHoursFromRow(row: CustomerBookingRow): number | null {
  if (typeof row.duration_minutes === "number" && Number.isFinite(row.duration_minutes)) {
    return row.duration_minutes / 60;
  }
  return null;
}
