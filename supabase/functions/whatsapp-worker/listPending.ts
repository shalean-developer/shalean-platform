import type { SupabaseClient } from "@supabase/supabase-js";
import { logSystemEvent } from "../_shared/logger.ts";
import { MAX_WHATSAPP_QUEUE_DELIVERY_ATTEMPTS } from "./types.ts";

export async function listPendingWhatsAppJobIds(
  admin: SupabaseClient,
  limit: number,
): Promise<{ ids: string[]; rpc_error?: string }> {
  const cap = Math.min(50, Math.max(1, limit));
  const { data, error } = await admin.rpc("get_pending_whatsapp_jobs", {
    limit_count: cap,
    max_delivery_attempts: MAX_WHATSAPP_QUEUE_DELIVERY_ATTEMPTS,
  });

  if (!error && Array.isArray(data)) {
    return { ids: (data as { id: string }[]).map((r) => String(r.id ?? "")).filter(Boolean) };
  }

  const rpc_error = error?.message;
  const nowMs = Date.now();
  const { data: rows, error: fbErr } = await admin
    .from("whatsapp_queue")
    .select("id,next_attempt_at")
    .eq("status", "pending")
    .lt("attempts", MAX_WHATSAPP_QUEUE_DELIVERY_ATTEMPTS)
    .order("priority", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(Math.min(150, cap * 5));

  if (fbErr) {
    return { ids: [], rpc_error: [rpc_error, fbErr.message].filter(Boolean).join(" | ") };
  }

  const eligible = (rows ?? []).filter((r) => {
    const na = (r as { next_attempt_at?: string | null }).next_attempt_at;
    if (na == null || na === "") return true;
    const t = new Date(na).getTime();
    return Number.isFinite(t) && t <= nowMs;
  });

  return {
    ids: eligible.slice(0, cap).map((r) => String((r as { id: string }).id)),
    rpc_error,
  };
}

export async function getWhatsAppQueueStatusCounts(
  admin: SupabaseClient,
): Promise<{
  pending: number;
  processing: number;
  sent: number;
  failed: number;
  dead: number;
  pending_retry: number;
}> {
  const { data: raw, error } = await admin.rpc("get_whatsapp_queue_status_metrics");
  let data: unknown = raw;
  if (typeof raw === "string") {
    try {
      data = JSON.parse(raw) as unknown;
    } catch {
      data = null;
    }
  }
  if (!error && data && typeof data === "object" && !Array.isArray(data)) {
    const d = data as Record<string, unknown>;
    const n = (k: string) => {
      const v = d[k];
      const x = typeof v === "number" ? v : Number(v);
      return Number.isFinite(x) && x >= 0 ? Math.floor(x) : 0;
    };
    return {
      pending: n("pending"),
      processing: n("processing"),
      sent: n("sent"),
      failed: n("failed"),
      dead: n("dead"),
      pending_retry: n("pending_retry"),
    };
  }

  const statuses = ["pending", "processing", "sent", "failed", "dead"] as const;
  const counts = { pending: 0, processing: 0, sent: 0, failed: 0, dead: 0, pending_retry: 0 };
  for (const st of statuses) {
    const { count } = await admin.from("whatsapp_queue").select("id", { count: "exact", head: true }).eq("status", st);
    counts[st] = count ?? 0;
  }
  const { count: retryCount } = await admin
    .from("whatsapp_queue")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending")
    .gt("attempts", 0);
  counts.pending_retry = retryCount ?? 0;
  return counts;
}

export async function logRpcFallback(admin: SupabaseClient, rpc_error: string | undefined, ids: string[]): Promise<void> {
  if (!ids.length && rpc_error) {
    await logSystemEvent({
      level: "warn",
      source: "edge/whatsapp_queue_worker_query",
      message: rpc_error,
      context: {},
      admin,
    });
  } else if (rpc_error) {
    await logSystemEvent({
      level: "info",
      source: "edge/whatsapp_queue_worker_rpc",
      message: "get_pending_whatsapp_jobs failed — used table scan fallback",
      context: { rpc_error },
      admin,
    });
  }
}
