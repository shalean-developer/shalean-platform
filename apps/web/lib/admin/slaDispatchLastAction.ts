import type { SupabaseClient } from "@supabase/supabase-js";

export type SlaLastActionPayload = {
  /** e.g. "Offer pending · 6m ago" */
  displayText: string;
  /** Minutes since the most recent dispatch touch; null if unknown. */
  lastActionMinutesAgo: number | null;
};

function parseMs(iso: string | null | undefined): number | null {
  if (!iso || !String(iso).trim()) return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : null;
}

function offerLabel(status: string): string {
  const st = status.toLowerCase();
  if (st === "pending") return "Offer sent";
  if (st === "rejected") return "Offer declined";
  if (st === "expired") return "Offer expired";
  if (st === "accepted") return "Offer accepted";
  return `Offer ${st || "update"}`;
}

/**
 * Latest dispatch touch per booking (offers + pending retry row) with recency for SLA ops UI.
 */
export async function fetchSlaDispatchLastActions(
  admin: SupabaseClient,
  bookingIds: string[],
): Promise<Map<string, SlaLastActionPayload>> {
  const out = new Map<string, SlaLastActionPayload>();
  if (bookingIds.length === 0) return out;

  const nowMs = Date.now();

  type Cand = { t: number; line: string };
  const candidates = new Map<string, Cand[]>();

  for (const id of bookingIds) {
    candidates.set(id, []);
  }

  const { data: offers } = await admin
    .from("dispatch_offers")
    .select("booking_id, status, created_at")
    .in("booking_id", bookingIds)
    .order("created_at", { ascending: false });

  const seenOfferBooking = new Set<string>();
  for (const raw of offers ?? []) {
    const o = raw as { booking_id?: string; status?: string | null; created_at?: string | null };
    const bid = String(o.booking_id ?? "");
    if (!bid || seenOfferBooking.has(bid)) continue;
    seenOfferBooking.add(bid);
    const t = parseMs(o.created_at);
    if (t == null) continue;
    const line = offerLabel(String(o.status ?? ""));
    const list = candidates.get(bid);
    if (list) list.push({ t, line });
  }

  const { data: retries } = await admin
    .from("dispatch_retry_queue")
    .select("booking_id, status, next_retry_at, created_at, updated_at")
    .in("booking_id", bookingIds)
    .eq("status", "pending");

  for (const raw of retries ?? []) {
    const row = raw as {
      booking_id?: string;
      created_at?: string | null;
      updated_at?: string | null;
    };
    const bid = String(row.booking_id ?? "");
    if (!bid) continue;
    const c0 = parseMs(row.created_at);
    const u0 = parseMs(row.updated_at);
    const t = Math.max(c0 ?? 0, u0 ?? 0);
    if (t <= 0) continue;
    const line = "Retry queued";
    const list = candidates.get(bid);
    if (list) list.push({ t, line });
  }

  for (const bid of bookingIds) {
    const list = candidates.get(bid) ?? [];
    if (list.length === 0) {
      out.set(bid, { displayText: "—", lastActionMinutesAgo: null });
      continue;
    }
    const best = list.reduce((a, b) => (a.t >= b.t ? a : b));
    const minutesAgo = Math.max(0, Math.floor((nowMs - best.t) / 60_000));
    const agoPart = minutesAgo === 0 ? "just now" : `${minutesAgo}m ago`;
    out.set(bid, {
      displayText: `${best.line} · ${agoPart}`,
      lastActionMinutesAgo: minutesAgo,
    });
  }

  return out;
}
