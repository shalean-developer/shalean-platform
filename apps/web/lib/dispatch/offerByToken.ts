import { format, isValid, parseISO } from "date-fns";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isValidOfferTokenFormat } from "./offerTokenFormat";
import { serverUnixMs } from "@/lib/time/serverClock";
import { formatCleanerPayZarLabel } from "@/lib/whatsapp/cleanerWhatsappTemplates";

export { isValidOfferTokenFormat };

const DATE_MAX = 30;
const TIME_MAX = 30;
const LOC_MAX = 60;

function formatOfferDate(raw: string): string {
  const d = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return (d || "Scheduled date").slice(0, DATE_MAX);
  const dt = parseISO(d);
  if (!isValid(dt)) return d.slice(0, DATE_MAX);
  return format(dt, "d MMMM yyyy").slice(0, DATE_MAX);
}

function formatOfferTime(raw: string): string {
  const t = raw.trim();
  const m = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (!m) return (t || "Scheduled time").slice(0, TIME_MAX);
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(mi) || h > 23 || mi > 59) return t.slice(0, TIME_MAX);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const hh = String(h12).padStart(2, "0");
  const mm = String(mi).padStart(2, "0");
  return `${hh}:${mm} ${ampm}`.slice(0, TIME_MAX);
}

function formatLocationPrimary(raw: string): string {
  const s = String(raw ?? "").trim();
  if (!s) return "TBD";
  const primary = s.split(",")[0]?.trim() ?? s;
  return primary.slice(0, LOC_MAX);
}

export type PublicDispatchOfferClosedReason =
  | "expired"
  | "taken"
  | "declined"
  | "cancelled"
  | "payment_expired"
  | "unknown";

export type PublicDispatchOfferView = {
  offerId: string;
  status: string;
  expiresAtIso: string;
  /** `closed` = no accept/decline; still show summary + CTA (old SMS links). */
  surface: "active" | "closed";
  closedReason?: PublicDispatchOfferClosedReason;
  /** `dispatch_offers.created_at` — staleness / analytics only. */
  offerCreatedAtIso?: string;
  /**
   * When the row is still `pending` but `expires_at` is already past (evaluated on the server at fetch time),
   * the client should treat the offer as closed immediately (no “still open” flicker).
   */
  offeredClosed?: boolean;
  booking: {
    id: string;
    location: string;
    dateLabel: string;
    timeLabel: string;
    payLabel: string;
  };
};

export type DispatchOfferTokenRow = {
  offerId: string;
  cleanerId: string;
  bookingId: string;
  status: string;
  expiresAtIso: string;
};

/** Loads offer id + cleaner for token-based accept/decline (service role). */
export async function fetchDispatchOfferRowByToken(
  supabase: SupabaseClient,
  token: string,
): Promise<DispatchOfferTokenRow | null> {
  const t = String(token ?? "").trim();
  if (!isValidOfferTokenFormat(t)) return null;

  const { data, error } = await supabase
    .from("dispatch_offers")
    .select("id, cleaner_id, status, expires_at, booking_id")
    .eq("offer_token", t)
    .maybeSingle();

  if (error || !data) return null;
  const row = data as { id: string; cleaner_id: string; status: string; expires_at: string; booking_id: string };
  return {
    offerId: row.id,
    cleanerId: row.cleaner_id,
    bookingId: row.booking_id,
    status: row.status,
    expiresAtIso: row.expires_at,
  };
}

export async function fetchDispatchOfferPublicByToken(
  supabase: SupabaseClient,
  token: string,
): Promise<PublicDispatchOfferView | null> {
  const t = String(token ?? "").trim();
  if (!isValidOfferTokenFormat(t)) return null;

  const { data: offer, error } = await supabase
    .from("dispatch_offers")
    .select("id, status, expires_at, booking_id, created_at")
    .eq("offer_token", t)
    .maybeSingle();

  if (error || !offer) return null;

  const row = offer as {
    id: string;
    status: string;
    expires_at: string;
    booking_id: string;
    created_at?: string;
  };
  const offerCreatedAtIso = typeof row.created_at === "string" ? row.created_at : undefined;

  const { data: booking, error: bErr } = await supabase
    .from("bookings")
    .select("id, location, date, time, total_paid_zar, amount_paid_cents, status")
    .eq("id", row.booking_id)
    .maybeSingle();

  const emptyBooking = {
    id: String(row.booking_id),
    location: "—",
    dateLabel: "—",
    timeLabel: "—",
    payLabel: "—",
  };

  if (bErr || !booking) {
    return {
      offerId: row.id,
      status: row.status,
      expiresAtIso: row.expires_at,
      surface: "closed",
      closedReason: "unknown",
      offerCreatedAtIso,
      booking: emptyBooking,
    };
  }

  const b = booking as {
    id: string;
    location?: string | null;
    date?: string | null;
    time?: string | null;
    total_paid_zar?: unknown;
    amount_paid_cents?: unknown;
    status?: string | null;
  };
  const timeRaw = String(b.time ?? "").trim();
  const timeHm = timeRaw.length >= 5 ? timeRaw.slice(0, 5) : timeRaw;

  const expMs = new Date(row.expires_at).getTime();
  const st = String(row.status ?? "").toLowerCase();
  const nowMs = serverUnixMs();
  const nowPastExpiry = Number.isFinite(expMs) && nowMs >= expMs;
  const offeredClosed = st === "pending" && nowPastExpiry;

  const bookingSt = String(b.status ?? "").toLowerCase();

  let closedReason: PublicDispatchOfferClosedReason | undefined;
  let surface: "active" | "closed" = "active";
  if (bookingSt === "payment_expired") {
    surface = "closed";
    closedReason = "payment_expired";
  } else if (bookingSt === "cancelled" || bookingSt === "failed") {
    surface = "closed";
    closedReason = "cancelled";
  } else if (st === "accepted") {
    surface = "closed";
    closedReason = "taken";
  } else if (st === "rejected") {
    surface = "closed";
    closedReason = "declined";
  } else if (st === "expired" || offeredClosed) {
    surface = "closed";
    closedReason = "expired";
  } else if (st !== "pending") {
    surface = "closed";
    closedReason = "unknown";
  }

  return {
    offerId: row.id,
    status: row.status,
    expiresAtIso: row.expires_at,
    surface,
    ...(closedReason ? { closedReason } : {}),
    ...(offerCreatedAtIso ? { offerCreatedAtIso } : {}),
    ...(offeredClosed ? { offeredClosed: true as const } : {}),
    booking: {
      id: b.id,
      location: formatLocationPrimary(String(b.location ?? "")),
      dateLabel: formatOfferDate(String(b.date ?? "")),
      timeLabel: formatOfferTime(timeHm),
      payLabel: formatCleanerPayZarLabel(b),
    },
  };
}
