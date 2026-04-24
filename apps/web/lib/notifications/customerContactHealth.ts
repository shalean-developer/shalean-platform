import {
  buildCustomerContactPhoneKey,
  phoneKeyDigitsForMatch,
} from "@/lib/notifications/customerPhoneNormalize";
import { reportOperationalIssue } from "@/lib/logging/systemLog";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type LogRow = { id: string; status: string | null; created_at: string; recipient: string | null };

function mergeByRecency(rows: LogRow[], limit: number): LogRow[] {
  const byId = new Map<string, LogRow>();
  for (const r of rows) {
    if (r?.id && !byId.has(r.id)) byId.set(r.id, r);
  }
  return Array.from(byId.values())
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, limit);
}

async function fetchCustomerLogsForPhoneKey(phoneKey: string): Promise<LogRow[]> {
  const admin = getSupabaseAdmin();
  if (!admin) return [];

  const tail = phoneKeyDigitsForMatch(phoneKey).slice(-12);
  const safeTail = tail.length >= 9 ? tail : "";

  const { data: exact, error: e1 } = await admin
    .from("notification_logs")
    .select("id, status, created_at, recipient")
    .eq("role", "customer")
    .eq("recipient", phoneKey)
    .order("created_at", { ascending: false })
    .limit(10);
  if (e1) return [];

  let loose: typeof exact = [];
  if (safeTail.length >= 9) {
    const { data: likeRows, error: e2 } = await admin
      .from("notification_logs")
      .select("id, status, created_at, recipient")
      .eq("role", "customer")
      .ilike("recipient", `%${safeTail}%`)
      .order("created_at", { ascending: false })
      .limit(12);
    if (!e2 && likeRows?.length) loose = likeRows;
  }

  return mergeByRecency([...(exact ?? []), ...(loose ?? [])], 10);
}

function scoreFromRows(rows: LogRow[]): { score: number; sampleSize: number } {
  if (!rows.length) return { score: 0, sampleSize: 0 };
  let sent = 0;
  for (const r of rows) {
    if (String(r.status ?? "") === "sent") sent++;
  }
  return { score: sent / rows.length, sampleSize: rows.length };
}

export async function recomputeAndUpsertCustomerContactHealth(phoneKey: string): Promise<void> {
  const admin = getSupabaseAdmin();
  if (!admin || !phoneKey.trim()) return;

  const rows = await fetchCustomerLogsForPhoneKey(phoneKey.trim());
  const { score, sampleSize } = scoreFromRows(rows);

  const { error } = await admin.from("customer_contact_health").upsert(
    {
      phone_key: phoneKey.trim(),
      success_rate: sampleSize ? score : 0,
      sample_size: sampleSize,
      last_updated: new Date().toISOString(),
    },
    { onConflict: "phone_key" },
  );
  if (error) {
    void reportOperationalIssue("warn", "customer_contact_health/upsert", error.message, { phoneKey });
  }
}

/**
 * After customer SMS/WhatsApp log writes, refresh the cached row for that recipient (async, non-blocking).
 */
export function scheduleCustomerContactHealthRefresh(input: {
  role?: string | null;
  channel: string;
  recipient: string;
}): void {
  if (String(input.role ?? "").toLowerCase() !== "customer") return;
  const ch = String(input.channel ?? "").toLowerCase();
  if (ch !== "sms" && ch !== "whatsapp") return;
  const key = buildCustomerContactPhoneKey(input.recipient);
  if (!key) return;
  void recomputeAndUpsertCustomerContactHealth(key);
}

/**
 * Rolling success rate for customer phone/SMS/WhatsApp (cache-first, then logs + upsert).
 * Returns null if fewer than `minSample` attempts.
 */
export async function getCustomerContactHealthScore(params: {
  bookingId: string;
  phoneHint?: string | null;
  minSample?: number;
}): Promise<{ score: number; sampleSize: number } | null> {
  const minSample = params.minSample ?? 3;
  const admin = getSupabaseAdmin();
  if (!admin) return null;

  const bid = params.bookingId.trim();
  if (!bid) return null;

  const phoneKey = buildCustomerContactPhoneKey(params.phoneHint ?? "");
  if (!phoneKey) return null;

  const { data: cached, error: cacheErr } = await admin
    .from("customer_contact_health")
    .select("success_rate, sample_size")
    .eq("phone_key", phoneKey)
    .maybeSingle();

  if (!cacheErr && cached && typeof cached === "object") {
    const row = cached as { success_rate?: number; sample_size?: number };
    const n = Number(row.sample_size ?? 0);
    const sr = Number(row.success_rate ?? 0);
    if (n >= minSample && Number.isFinite(sr) && sr >= 0 && sr <= 1) {
      return { score: sr, sampleSize: n };
    }
  }

  const rows = await fetchCustomerLogsForPhoneKey(phoneKey);
  const { score, sampleSize } = scoreFromRows(rows);
  await recomputeAndUpsertCustomerContactHealth(phoneKey);
  if (sampleSize < minSample) return null;
  return { score, sampleSize };
}
