import type { BookingSnapshotV1 } from "@/lib/booking/paystackChargeTypes";
import type { BookingRow, CleanerEmbed, DashboardBooking, NormalizedBookingStatus } from "@/lib/dashboard/types";
import {
  parseStoredJobPriceBreakdown,
  parseStoredPriceBreakdown,
  priceLinesFromStoredCheckoutQuote,
  type StoredPriceLine,
} from "@/lib/dashboard/storedPriceBreakdown";

export type { NormalizedBookingStatus } from "@/lib/dashboard/types";

export function normalizeStatus(s: string | null | undefined): NormalizedBookingStatus {
  const v = (s ?? "pending").toLowerCase();
  if (
    v === "pending" ||
    v === "pending_assignment" ||
    v === "offered" ||
    v === "confirmed" ||
    v === "assigned" ||
    v === "in_progress" ||
    v === "completed" ||
    v === "cancelled" ||
    v === "failed"
  ) {
    return v;
  }
  return "pending";
}

/** Checkout-locked total when `bookings.total_price` is set (Postgres numeric may arrive as string). */
export function lockedTotalZarFromRow(row: Pick<BookingRow, "total_price">): number | null {
  const v = row.total_price;
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n);
}

export function priceZarFromRow(row: BookingRow): number {
  const locked = lockedTotalZarFromRow(row);
  if (locked != null) return locked;
  const bd = parseStoredPriceBreakdown(row.price_breakdown);
  if (bd) return bd.totalZar;
  if (typeof row.total_paid_zar === "number" && Number.isFinite(row.total_paid_zar)) return row.total_paid_zar;
  return Math.round((row.amount_paid_cents ?? 0) / 100);
}

function initials(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (p.length === 0) return "?";
  if (p.length === 1) return p[0]!.slice(0, 2).toUpperCase();
  return (p[0]![0] + p[p.length - 1]![0]).toUpperCase();
}

function snapshotExtras(snapshot: BookingSnapshotV1 | null | undefined): string[] {
  const ex = snapshot?.locked?.extras;
  if (Array.isArray(ex)) return ex.map(String);
  const flat = snapshot?.flat?.extras;
  if (Array.isArray(flat)) return flat.map(String);
  return [];
}

/** Labels for dashboard only — from persisted `bookings.extras` line items when present. */
function extrasDisplayFromRow(row: BookingRow, snapshot: BookingSnapshotV1 | null): string[] {
  const raw = row.extras;
  if (Array.isArray(raw) && raw.length > 0) {
    const out: string[] = [];
    for (const x of raw) {
      if (x && typeof x === "object") {
        const o = x as { name?: string; slug?: string; price?: unknown };
        const name = typeof o.name === "string" ? o.name.trim() : "";
        const priceRaw = o.price;
        const p = typeof priceRaw === "number" ? priceRaw : Number(priceRaw);
        if (name && Number.isFinite(p)) {
          out.push(`${name} · R ${Math.round(p).toLocaleString("en-ZA")}`);
          continue;
        }
        if (name) {
          out.push(name);
          continue;
        }
      }
      out.push(String(x));
    }
    if (out.length) return out;
  }
  return snapshotExtras(snapshot);
}

function snapshotRooms(snapshot: BookingSnapshotV1 | null | undefined, rooms: number | null, bathrooms: number | null): string[] {
  const parts: string[] = [];
  if (typeof rooms === "number" && rooms > 0) parts.push(`${rooms} bedroom${rooms === 1 ? "" : "s"}`);
  if (typeof bathrooms === "number" && bathrooms > 0) parts.push(`${bathrooms} bathroom${bathrooms === 1 ? "" : "s"}`);
  if (parts.length) return parts;
  const r = snapshot?.locked?.rooms;
  const b = snapshot?.locked?.bathrooms;
  if (typeof r === "number" && r > 0) parts.push(`${r} bedroom${r === 1 ? "" : "s"}`);
  if (typeof b === "number" && b > 0) parts.push(`${b} bathroom${b === 1 ? "" : "s"}`);
  return parts.length ? parts : ["—"];
}

function priceLinesFromRow(row: BookingRow): StoredPriceLine[] {
  const breakdown = parseStoredPriceBreakdown(row.price_breakdown);
  const locked = lockedTotalZarFromRow(row);
  if (breakdown) {
    const totalForLines = locked ?? breakdown.totalZar;
    const jobSplit = parseStoredJobPriceBreakdown(row.price_breakdown);
    const pricingVersionId =
      typeof row.pricing_version_id === "string" && row.pricing_version_id.trim()
        ? row.pricing_version_id.trim()
        : null;
    return priceLinesFromStoredCheckoutQuote(breakdown, totalForLines, jobSplit, {
      pricingVersionId,
      pricingCatalogCodeVersion: breakdown.pricingVersion,
    });
  }
  return [{ kind: "total_paid_fallback", label: "Total paid", amountZar: priceZarFromRow(row) }];
}

/** Customer or cleaner UI: locked checkout lines from persisted `price_breakdown` + `total_price` only. */
export function checkoutPriceLinesFromPersisted(
  row: Pick<BookingRow, "price_breakdown" | "total_price" | "total_paid_zar" | "amount_paid_cents" | "pricing_version_id">,
): StoredPriceLine[] | null {
  const breakdown = parseStoredPriceBreakdown(row.price_breakdown);
  if (!breakdown) return null;
  const locked = lockedTotalZarFromRow(row);
  const totalForLines = locked ?? breakdown.totalZar;
  const jobSplit = parseStoredJobPriceBreakdown(row.price_breakdown);
  const pricingVersionId =
    typeof row.pricing_version_id === "string" && row.pricing_version_id.trim()
      ? row.pricing_version_id.trim()
      : null;
  return priceLinesFromStoredCheckoutQuote(breakdown, totalForLines, jobSplit, {
    pricingVersionId,
    pricingCatalogCodeVersion: breakdown.pricingVersion,
  });
}

export function priceZarFromPersisted(
  row: Pick<BookingRow, "total_price" | "price_breakdown" | "total_paid_zar" | "amount_paid_cents">,
): number {
  return priceZarFromRow(row as BookingRow);
}

function cleanerFromRow(row: BookingRow): DashboardBooking["cleaner"] {
  const emb = row.cleaners as CleanerEmbed;
  const snap = (row.booking_snapshot ?? null) as BookingSnapshotV1 | null;
  const snapName = snap?.cleaner_name;
  const name = (emb?.full_name && emb.full_name.trim()) || (typeof snapName === "string" && snapName.trim()) || "";
  if (!name) return null;
  const phone = emb?.phone?.trim() || undefined;
  return { name, initials: initials(name), phone };
}

export function mapBookingRow(row: BookingRow): DashboardBooking {
  const snapshot = (row.booking_snapshot ?? null) as BookingSnapshotV1 | null;
  const date = row.date && /^\d{4}-\d{2}-\d{2}$/.test(row.date) ? row.date : snapshot?.flat?.date ?? row.created_at.slice(0, 10);
  const time = row.time?.trim() || snapshot?.flat?.time || "09:00";
  const loc = row.location?.trim() || snapshot?.flat?.location || "";
  const suburb = loc.includes(",") ? loc.split(",").slice(-1)[0]!.trim() : loc || "—";
  const addressLine = loc.includes(",") ? loc.split(",")[0]!.trim() : loc || "—";
  const durationMin = typeof row.duration_minutes === "number" && row.duration_minutes > 0 ? row.duration_minutes : null;
  const hoursSnap = snapshot?.locked?.finalHours;
  const breakdown = parseStoredPriceBreakdown(row.price_breakdown);
  const durationHours =
    breakdown != null && typeof breakdown.hours === "number" && breakdown.hours > 0
      ? Math.round(breakdown.hours * 10) / 10
      : durationMin != null
        ? Math.round((durationMin / 60) * 10) / 10
        : typeof hoursSnap === "number" && hoursSnap > 0
          ? hoursSnap
          : 2;

  const scheduledAt = `${date}T${time.length === 5 ? `${time}:00` : time}`;
  const priceDisplayFromCheckout = breakdown != null;
  const checkoutPriceContext = priceDisplayFromCheckout ? { bookingId: row.id } : null;

  return {
    id: row.id,
    serviceName: row.service?.trim() || "Cleaning service",
    date,
    time: time.length >= 5 ? time.slice(0, 5) : time,
    addressLine,
    suburb,
    priceZar: priceZarFromRow(row),
    status: normalizeStatus(row.status),
    durationHours,
    rooms: snapshotRooms(snapshot, row.rooms ?? null, row.bathrooms ?? null),
    extras: extrasDisplayFromRow(row, snapshot),
    priceLines: priceLinesFromRow(row),
    cleaner: cleanerFromRow(row),
    paystackReference: row.paystack_reference,
    createdAt: row.created_at,
    scheduledAt,
    raw: row,
    priceDisplayFromCheckout,
    checkoutPriceContext,
    pricingAlgorithmVersion: breakdown?.pricingVersion ?? null,
  };
}

export function isUpcomingBookingRow(b: DashboardBooking): boolean {
  const st = b.status;
  if (st === "completed" || st === "cancelled" || st === "failed") return false;
  const t = new Date(b.scheduledAt).getTime();
  if (!Number.isFinite(t)) return true;
  return t >= Date.now() - 24 * 60 * 60 * 1000;
}

export function formatBookingWhen(date: string, time: string): string {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return "—";
  const [y, m, d] = date.split("-").map(Number);
  const label = new Date(y, m - 1, d).toLocaleDateString("en-ZA", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return time ? `${label} · ${time}` : label;
}
