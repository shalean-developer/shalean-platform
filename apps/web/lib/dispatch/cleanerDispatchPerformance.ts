import type { SupabaseClient } from "@supabase/supabase-js";

const MAX_OFFERS_PER_CLEANER = 50;
const FETCH_CAP = 2500;
const MIN_SAMPLE = 5;

export type CleanerDispatchPerformanceStats = {
  n: number;
  accepted: number;
  rejected: number;
  expired: number;
  withRead: number;
  withDelivered: number;
  ignoredReadExpired: number;
  avgResponseLatencyMs: number | null;
};

type OfferPerfRow = {
  cleaner_id?: string;
  status?: string;
  response_latency_ms?: number | null;
  first_read_at?: string | null;
  first_delivered_at?: string | null;
  whatsapp_sent_at?: string | null;
  responded_at?: string | null;
};

function summarizeRows(rows: OfferPerfRow[]): CleanerDispatchPerformanceStats {
  const s: CleanerDispatchPerformanceStats = {
    n: rows.length,
    accepted: 0,
    rejected: 0,
    expired: 0,
    withRead: 0,
    withDelivered: 0,
    ignoredReadExpired: 0,
    avgResponseLatencyMs: null,
  };
  let latSum = 0;
  let latN = 0;

  for (const r of rows) {
    const st = String(r.status ?? "").toLowerCase();
    if (st === "accepted") s.accepted++;
    else if (st === "rejected") s.rejected++;
    else if (st === "expired") s.expired++;

    if (r.first_read_at) s.withRead++;
    if (r.first_delivered_at) s.withDelivered++;

    if (st === "expired" && r.first_read_at) {
      s.ignoredReadExpired++;
    }

    const lat = r.response_latency_ms;
    if (typeof lat === "number" && Number.isFinite(lat) && lat > 0) {
      latSum += lat;
      latN++;
    }
  }

  s.avgResponseLatencyMs = latN > 0 ? latSum / latN : null;
  return s;
}

/**
 * Phase 8E: 0–1 score from recent WhatsApp dispatch offers (last N per cleaner).
 * Uses: accept_rate, read_rate, inverse response time, delivery proxy, ignore penalty.
 */
export function computeDispatchPerformance01(s: CleanerDispatchPerformanceStats): number {
  if (s.n < MIN_SAMPLE) return 0.5;

  const decided = s.accepted + s.rejected + s.expired;
  const acceptRate = decided > 0 ? s.accepted / decided : 0.5;
  const readRate = s.n > 0 ? s.withRead / s.n : 0.5;
  const delRate = s.n > 0 ? s.withDelivered / s.n : readRate * 0.95 + 0.05;

  let speedTerm = 0.35;
  if (s.avgResponseLatencyMs != null && s.avgResponseLatencyMs > 0 && Number.isFinite(s.avgResponseLatencyMs)) {
    const inv = 1000 / Math.max(800, s.avgResponseLatencyMs);
    speedTerm = Math.min(1, inv / 1.2);
  }

  const ignoredRate = s.n > 0 ? s.ignoredReadExpired / s.n : 0;
  let raw =
    acceptRate * 0.4 + readRate * 0.2 + speedTerm * 0.2 + delRate * 0.2 - Math.min(0.25, ignoredRate * 0.35);

  if (raw < 0) raw = 0;
  if (raw > 1) raw = 1;
  return raw;
}

/**
 * One bounded query + in-memory bucketing (last {@link MAX_OFFERS_PER_CLEANER} rows per cleaner).
 */
export async function loadCleanerDispatchPerformanceScores(
  supabase: SupabaseClient,
  cleanerIds: string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!cleanerIds.length) return out;

  const { data, error } = await supabase
    .from("dispatch_offers")
    .select(
      "cleaner_id, status, response_latency_ms, first_read_at, first_delivered_at, whatsapp_sent_at, responded_at",
    )
    .in("cleaner_id", cleanerIds)
    .not("whatsapp_sent_at", "is", null)
    .order("whatsapp_sent_at", { ascending: false })
    .limit(FETCH_CAP);

  if (error || !data?.length) {
    for (const id of cleanerIds) out.set(id, 0.5);
    return out;
  }

  const buckets = new Map<string, OfferPerfRow[]>();
  for (const raw of data as OfferPerfRow[]) {
    const cid = String(raw.cleaner_id ?? "");
    if (!cid) continue;
    const arr = buckets.get(cid) ?? [];
    if (arr.length >= MAX_OFFERS_PER_CLEANER) continue;
    arr.push(raw);
    buckets.set(cid, arr);
  }

  for (const id of cleanerIds) {
    const rows = buckets.get(id) ?? [];
    const stats = summarizeRows(rows);
    out.set(id, computeDispatchPerformance01(stats));
  }

  return out;
}
