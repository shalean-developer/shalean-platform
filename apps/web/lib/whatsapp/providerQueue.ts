import type { SupabaseClient } from "@supabase/supabase-js";
import { customerPhoneToE164 } from "@/lib/notifications/customerPhoneNormalize";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { getWhatsAppProvider, getWhatsAppProviderName } from "@/lib/whatsapp/providers";
import type { WhatsAppRecipientRole } from "@/lib/whatsapp/providers/types";
import type { WhatsAppQueuePayload } from "@/lib/whatsapp/types";

const MAX_ATTEMPTS = 5;
const STALE_PROCESSING_MS = 2 * 60 * 1000;

function digits(phone: string): string {
  return String(phone ?? "").replace(/\D/g, "");
}

function parsePayload(type: string, payload: unknown): WhatsAppQueuePayload | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const p = payload as Record<string, unknown>;
  if (type === "text" && p.kind === "text" && typeof p.text === "string") {
    return { kind: "text", text: p.text };
  }
  if (type === "template" && p.kind === "template" && typeof p.templateName === "string") {
    if (!Array.isArray(p.bodyParams)) return null;
    return {
      kind: "template",
      templateName: p.templateName,
      language: typeof p.language === "string" ? p.language : undefined,
      bodyParams: p.bodyParams.map(String),
    };
  }
  return null;
}

function roleFromRow(row: Record<string, unknown>): WhatsAppRecipientRole {
  if (row.recipient_role === "customer") return "customer";
  if (row.recipient_role === "cleaner") return "cleaner";
  const context = row.context && typeof row.context === "object" && !Array.isArray(row.context)
    ? row.context as Record<string, unknown>
    : {};
  if (context.recipient_role === "customer" || context.recipientRole === "customer") return "customer";
  return "cleaner";
}

function retryDelayMs(attempts: number): number {
  const baseRaw = Number(process.env.WHATSAPP_QUEUE_RETRY_BASE_SEC ?? "60");
  const base = Number.isFinite(baseRaw) && baseRaw > 0 ? Math.min(baseRaw, 3600) : 60;
  return Math.round(base * 1000 * 2 ** Math.max(1, attempts) * (0.9 + Math.random() * 0.2));
}

async function recoverStale(admin: SupabaseClient): Promise<void> {
  const staleBefore = new Date(Date.now() - STALE_PROCESSING_MS).toISOString();
  await admin.from("whatsapp_queue")
    .update({ status: "pending", next_attempt_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("status", "processing")
    .lt("updated_at", staleBefore);
}

async function pendingIds(admin: SupabaseClient, limit: number): Promise<string[]> {
  const cap = Math.max(1, Math.min(50, limit));
  const now = new Date().toISOString();
  const { data, error } = await admin.from("whatsapp_queue")
    .select("id,next_attempt_at")
    .eq("status", "pending")
    .lt("attempts", MAX_ATTEMPTS)
    .or(`next_attempt_at.is.null,next_attempt_at.lte.${now}`)
    .order("priority", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(cap);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => String((r as { id?: string }).id ?? "")).filter(Boolean);
}

export async function flushWhatsAppJobViaProvider(
  admin: SupabaseClient,
  jobId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { data: claimed, error: claimError } = await admin.from("whatsapp_queue")
    .update({ status: "processing", updated_at: new Date().toISOString(), next_attempt_at: null })
    .eq("id", jobId)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();
  if (claimError) return { ok: false, error: claimError.message };
  if (!claimed) {
    const { data } = await admin.from("whatsapp_queue").select("status,last_error").eq("id", jobId).maybeSingle();
    if ((data as { status?: string } | null)?.status === "sent") return { ok: true };
    return { ok: false, error: "concurrent_or_not_pending" };
  }

  const row = claimed as Record<string, unknown>;
  const payload = parsePayload(String(row.type ?? ""), row.payload);
  if (!payload) {
    await admin.from("whatsapp_queue").update({
      status: "dead", attempts: MAX_ATTEMPTS, last_error: "invalid_queue_payload",
      next_attempt_at: null, updated_at: new Date().toISOString(),
    }).eq("id", jobId);
    return { ok: false, error: "invalid_queue_payload" };
  }

  const provider = getWhatsAppProvider();
  const providerName = getWhatsAppProviderName();
  const role = roleFromRow(row);
  const phone = String(row.phone_e164 || row.phone || "");

  try {
    const result = payload.kind === "template"
      ? await provider.sendTemplate({
          phone,
          templateName: payload.templateName,
          language: payload.language ?? "en",
          bodyParams: payload.bodyParams,
          recipientRole: role,
        })
      : await provider.sendText({ phone, message: payload.text, recipientRole: role });

    if (!result.ok) throw new Error(result.error || `${providerName}_send_failed`);

    const messageId = result.messageId ?? null;
    const patch: Record<string, unknown> = {
      status: "sent",
      provider: providerName,
      provider_message_id: messageId,
      recipient_role: role,
      delivery_status: "sent",
      last_error: null,
      next_attempt_at: null,
      sent_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (providerName === "meta") patch.meta_message_id = messageId;

    await admin.from("whatsapp_queue").update(patch).eq("id", jobId).eq("status", "processing");
    await logSystemEvent({
      level: "info",
      source: "whatsapp_provider_queue_sent",
      message: "WhatsApp queue job sent",
      context: { job_id: jobId, provider: providerName, provider_message_id: messageId, recipient_role: role },
    });
    return { ok: true };
  } catch (error) {
    const msg = (error instanceof Error ? error.message : String(error)).slice(0, 2000);
    const attempts = Number(row.attempts ?? 0) + 1;
    const dead = attempts >= MAX_ATTEMPTS;
    const nextAttemptAt = dead ? null : new Date(Date.now() + retryDelayMs(attempts)).toISOString();
    await admin.from("whatsapp_queue").update({
      status: dead ? "dead" : "pending",
      provider: providerName,
      recipient_role: role,
      attempts,
      last_error: msg,
      next_attempt_at: nextAttemptAt,
      updated_at: new Date().toISOString(),
    }).eq("id", jobId).eq("status", "processing");
    await logSystemEvent({
      level: dead ? "error" : "warn",
      source: dead ? "whatsapp_provider_queue_dead" : "whatsapp_provider_queue_retry",
      message: msg,
      context: { job_id: jobId, provider: providerName, attempts, next_attempt_at: nextAttemptAt },
    });
    return { ok: false, error: msg };
  }
}

export async function processWhatsAppPendingBatchViaProvider(params: {
  admin: SupabaseClient;
  limit?: number;
  includeQueueMetrics?: boolean;
}): Promise<{
  processed: number;
  ok: number;
  failed: number;
  queue_metrics?: Record<string, number>;
  worker_meta: { provider: string };
}> {
  await recoverStale(params.admin);
  const ids = await pendingIds(params.admin, params.limit ?? 15);
  let ok = 0;
  let failed = 0;
  for (const id of ids) {
    const result = await flushWhatsAppJobViaProvider(params.admin, id);
    if (result.ok) ok += 1;
    else failed += 1;
  }

  let queue_metrics: Record<string, number> | undefined;
  if (params.includeQueueMetrics) {
    queue_metrics = {};
    for (const status of ["pending", "processing", "sent", "failed", "dead"]) {
      const { count } = await params.admin.from("whatsapp_queue")
        .select("id", { count: "exact", head: true })
        .eq("status", status);
      queue_metrics[status] = count ?? 0;
    }
  }
  return { processed: ids.length, ok, failed, queue_metrics, worker_meta: { provider: getWhatsAppProviderName() } };
}

export async function enqueueProviderWhatsApp(params: {
  admin: SupabaseClient;
  phone: string;
  type: "text" | "template";
  payload: WhatsAppQueuePayload;
  recipientRole: WhatsAppRecipientRole;
  context?: Record<string, unknown>;
  idempotencyKey?: string | null;
  priority?: number;
}): Promise<{ id: string | null; error?: string }> {
  const phoneDigits = digits(params.phone);
  if (phoneDigits.length < 10 || phoneDigits.length > 15) return { id: null, error: "invalid_phone" };
  const e164 = customerPhoneToE164(params.phone) || `+${phoneDigits}`;
  const provider = getWhatsAppProviderName();
  const key = params.idempotencyKey?.trim() || null;
  if (key) {
    const { data } = await params.admin.from("whatsapp_queue")
      .select("id")
      .eq("idempotency_key", key)
      .in("status", ["pending", "processing", "sent"])
      .limit(1)
      .maybeSingle();
    if (data?.id) return { id: String(data.id) };
  }
  const insert: Record<string, unknown> = {
    phone: phoneDigits,
    phone_raw: params.phone.slice(0, 48),
    phone_digits: phoneDigits,
    phone_e164: e164,
    type: params.type,
    payload: params.payload,
    context: params.context ?? {},
    status: "pending",
    attempts: 0,
    priority: params.priority ?? 0,
    provider,
    recipient_role: params.recipientRole,
    updated_at: new Date().toISOString(),
  };
  if (key) insert.idempotency_key = key;
  const { data, error } = await params.admin.from("whatsapp_queue").insert(insert).select("id").single();
  if (error) return { id: null, error: error.message };
  return { id: String(data.id) };
}
