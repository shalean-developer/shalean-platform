import type { SupabaseClient } from "@supabase/supabase-js";
import {
  metaWhatsAppToDigits,
  sendViaMetaWhatsApp,
  sendViaMetaWhatsAppTemplateBody,
} from "@/lib/dispatch/metaWhatsAppSend";
import { metaCircuitOpenRemainingMs } from "@/lib/whatsapp/whatsappMetaSafeguards";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { customerPhoneToE164 } from "@/lib/notifications/customerPhoneNormalize";
import { sendTerminalQueueFailureSmsIfEligible } from "@/lib/whatsapp/queueTerminalSms";
import type { WhatsAppQueuePayload } from "@/lib/whatsapp/types";

export type { WhatsAppQueuePayload } from "@/lib/whatsapp/types";

/** After this many failed Meta delivery attempts, row becomes `dead` (no more cron picks). */
export const MAX_WHATSAPP_QUEUE_DELIVERY_ATTEMPTS = 5;

export type WhatsAppQueueRow = {
  id: string;
  phone: string;
  type: string;
  payload: unknown;
  context: unknown;
  status: string;
  attempts: number;
  last_error: string | null;
  meta_message_id: string | null;
  idempotency_key?: string | null;
  delivery_status?: string | null;
  priority?: number;
  next_attempt_at?: string | null;
  phone_raw?: string | null;
  phone_e164?: string | null;
  phone_digits?: string | null;
};

function parsePayload(row: { type: string; payload: unknown }): WhatsAppQueuePayload | null {
  const p = row.payload;
  if (!p || typeof p !== "object" || Array.isArray(p)) return null;
  const o = p as Record<string, unknown>;
  if (row.type === "text" && o.kind === "text" && typeof o.text === "string") {
    return { kind: "text", text: o.text };
  }
  if (row.type === "template" && o.kind === "template" && typeof o.templateName === "string") {
    const bp = o.bodyParams;
    if (!Array.isArray(bp)) return null;
    return {
      kind: "template",
      templateName: o.templateName,
      language: typeof o.language === "string" ? o.language : undefined,
      bodyParams: bp.map((x) => String(x)),
    };
  }
  return null;
}

const ACTIVE_STATUSES = ["pending", "processing", "sent"] as const;

/** Jobs left `processing` longer than this (e.g. crashed worker) are reset to `pending` before each worker batch. */
const STALE_PROCESSING_MS = 2 * 60 * 1000;

/**
 * Recover rows stuck in `processing` (crash mid-flush). Only rows with `next_attempt_at` null
 * (see claim step) and `updated_at` older than {@link STALE_PROCESSING_MS}.
 */
async function recoverStaleProcessingWhatsAppJobs(admin: SupabaseClient): Promise<number> {
  const staleBefore = new Date(Date.now() - STALE_PROCESSING_MS).toISOString();
  const nowIso = new Date().toISOString();
  const { data, error } = await admin
    .from("whatsapp_queue")
    .update({ status: "pending", next_attempt_at: nowIso, updated_at: nowIso })
    .eq("status", "processing")
    .is("next_attempt_at", null)
    .lt("updated_at", staleBefore)
    .select("id");

  if (error) {
    await logSystemEvent({
      level: "warn",
      source: "whatsapp_queue_recover_processing_failed",
      message: error.message,
      context: {},
    });
    return 0;
  }
  const count = (data ?? []).length;
  if (count > 0) {
    const sample_ids = (data ?? []).slice(0, 5).map((r) => String((r as { id?: string }).id ?? ""));
    await logSystemEvent({
      level: "warn",
      source: "whatsapp_queue_recovered_processing",
      message: `Reset ${count} stale processing WhatsApp queue row(s) to pending`,
      context: { count, sample_ids },
    });
  }
  return count;
}

/**
 * Exponential backoff with jitter (ms): `baseSec × 2^attempts × (0.9 + random×0.2)`.
 * `attemptsAfterFailure` is 1-based (first failure uses 2^1 × base, …).
 * Jitter prevents synchronized retries from hammering Meta.
 */
export function whatsappQueueRetryDelayMs(attemptsAfterFailure: number): number {
  const baseSec = Number(process.env.WHATSAPP_QUEUE_RETRY_BASE_SEC ?? "60");
  const base = Number.isFinite(baseSec) && baseSec > 0 ? Math.min(3600, baseSec) : 60;
  const a = Math.max(1, Math.floor(attemptsAfterFailure));
  const jitter = 0.9 + Math.random() * 0.2;
  return Math.round(base * 1000 * 2 ** a * jitter);
}

function isMetaCircuitPauseQueueError(msg: string): boolean {
  return /circuit_open|send paused \(circuit|Meta WhatsApp send paused/i.test(msg);
}

function queueSuccessLogSampleRate(): number {
  const raw = process.env.WHATSAPP_QUEUE_SUCCESS_LOG_SAMPLE_RATE?.trim();
  if (raw === "1" || raw === "") return 1;
  const n = raw ? Number(raw) : 0.1;
  if (!Number.isFinite(n)) return 0.1;
  return Math.min(1, Math.max(0, n));
}

function shouldLogQueueDeliveredSuccess(): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  const r = queueSuccessLogSampleRate();
  if (r >= 1) return true;
  if (r <= 0) return false;
  return Math.random() < r;
}

/** Prefer DB RPC {@link get_pending_whatsapp_jobs}; falls back if migration not applied. */
async function listPendingWhatsAppJobIds(
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

function contextFromJob(job: WhatsAppQueueRow): Record<string, unknown> {
  return typeof job.context === "object" && job.context !== null && !Array.isArray(job.context)
    ? (job.context as Record<string, unknown>)
    : {};
}

/** Observable alert when a row reaches terminal `dead` (permanent delivery loss). */
async function logWhatsAppQueueDead(params: {
  jobId: string;
  job: WhatsAppQueueRow;
  reason: string;
  attempts?: number;
}): Promise<void> {
  await logSystemEvent({
    level: "error",
    source: "whatsapp_queue_dead",
    message: params.reason.slice(0, 500),
    context: {
      job_id: params.jobId,
      attempts: params.attempts ?? params.job.attempts,
      type: params.job.type,
      priority: params.job.priority,
      idempotency_key: params.job.idempotency_key ?? null,
      ...contextFromJob(params.job),
      last_error: params.reason.slice(0, 500),
    },
  });
}

/**
 * Insert a pending row (or return an existing active row for the same idempotency key).
 * Caller may await {@link flushWhatsAppJobById} for immediate delivery (SMS fallback paths).
 */
export async function enqueueWhatsApp(params: {
  admin: SupabaseClient;
  phone: string;
  /** Original recipient string for logs / future non-SA parsing (optional). */
  phoneRaw?: string | null;
  type: "text" | "template";
  payload: WhatsAppQueuePayload;
  context?: Record<string, unknown>;
  /** Prevents duplicate sends while a row is `pending`, `processing`, or `sent` (terminal `failed`/`dead` allow a new row). */
  idempotencyKey?: string | null;
  /** Higher = picked sooner by the worker (default 0). */
  priority?: number;
}): Promise<{ id: string } | { id: null; error: string }> {
  const digits = metaWhatsAppToDigits(params.phone);
  if (digits.length < 10 || digits.length > 15) {
    return { id: null, error: "invalid_phone" };
  }
  if (params.type === "text" && params.payload.kind !== "text") {
    return { id: null, error: "payload_type_mismatch" };
  }
  if (params.type === "template" && params.payload.kind !== "template") {
    return { id: null, error: "payload_type_mismatch" };
  }

  const key = params.idempotencyKey?.trim() || null;
  if (key) {
    const { data: existing, error: exErr } = await params.admin
      .from("whatsapp_queue")
      .select("id,status,meta_message_id")
      .eq("idempotency_key", key)
      .in("status", [...ACTIVE_STATUSES])
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (exErr) {
      await logSystemEvent({
        level: "warn",
        source: "whatsapp_queue_idempotency_lookup_failed",
        message: exErr.message,
        context: { idempotency_key: key },
      });
    } else if (existing && typeof (existing as { id?: unknown }).id === "string") {
      const id = (existing as { id: string }).id;
      const st = String((existing as { status?: string }).status ?? "");
      await logSystemEvent({
        level: "info",
        source: "whatsapp_queue_idempotent_reuse",
        message: st === "sent" ? "Skipped enqueue — same idempotency key already sent" : "Reusing pending/processing row for idempotency key",
        context: { idempotency_key: key, existing_id: id, existing_status: st },
      });
      return { id };
    }
  }

  const now = new Date().toISOString();
  const priority = typeof params.priority === "number" && Number.isFinite(params.priority) ? Math.round(params.priority) : 0;
  const rawTrim = (params.phoneRaw ?? "").trim();
  const rawForE164 = rawTrim || `+${digits}`;
  const e164 = customerPhoneToE164(rawForE164);
  const insertRow: Record<string, unknown> = {
    phone: digits,
    type: params.type,
    payload: params.payload,
    context: params.context ?? {},
    status: "pending",
    attempts: 0,
    updated_at: now,
    priority,
    phone_digits: digits,
    phone_raw: rawTrim ? rawTrim.slice(0, 48) : null,
    phone_e164: e164 ? e164.slice(0, 32) : null,
  };
  if (key) insertRow.idempotency_key = key;

  const { data, error } = await params.admin.from("whatsapp_queue").insert(insertRow).select("id").single();

  if (error) {
    const dup =
      key &&
      (String((error as { code?: unknown }).code ?? "") === "23505" ||
        String(error.message).toLowerCase().includes("duplicate"));
    if (dup) {
      const { data: row } = await params.admin
        .from("whatsapp_queue")
        .select("id")
        .eq("idempotency_key", key)
        .in("status", [...ACTIVE_STATUSES])
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (row && typeof (row as { id?: unknown }).id === "string") {
        await logSystemEvent({
          level: "info",
          source: "whatsapp_queue_idempotent_race",
          message: "Resolved duplicate idempotency insert to existing row",
          context: { idempotency_key: key, id: (row as { id: string }).id },
        });
        return { id: (row as { id: string }).id };
      }
    }
    await logSystemEvent({
      level: "error",
      source: "whatsapp_queue_enqueue_failed",
      message: error.message ?? "insert returned no id",
      context: { type: params.type, digits_tail: digits.slice(-4), idempotency_key: key },
    });
    return { id: null, error: error.message ?? "enqueue_failed" };
  }
  if (!data || typeof (data as { id?: unknown }).id !== "string") {
    return { id: null, error: "enqueue_failed" };
  }
  return { id: (data as { id: string }).id };
}

/**
 * Claim pending → processing, call Meta, set sent / pending (with backoff) / dead.
 */
export async function flushWhatsAppJobById(
  admin: SupabaseClient,
  jobId: string,
): Promise<{ ok: boolean; error?: string; meta_circuit_retry_scheduled?: boolean }> {
  const { data: row0, error: readErr } = await admin.from("whatsapp_queue").select("*").eq("id", jobId).maybeSingle();
  if (readErr || !row0) {
    return { ok: false, error: "job_not_found" };
  }
  const row = row0 as WhatsAppQueueRow;
  if (row.status === "sent") {
    return { ok: true };
  }
  if (row.status === "failed" || row.status === "dead") {
    return { ok: false, error: row.last_error ?? row.status };
  }

  const nowIso = new Date().toISOString();
  const { data: claimed, error: claimErr } = await admin
    .from("whatsapp_queue")
    .update({ status: "processing", updated_at: nowIso, next_attempt_at: null })
    .eq("id", jobId)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();

  if (claimErr) {
    return { ok: false, error: claimErr.message };
  }
  if (!claimed) {
    const { data: again } = await admin.from("whatsapp_queue").select("status,last_error").eq("id", jobId).maybeSingle();
    const st = String((again as { status?: string } | null)?.status ?? "");
    if (st === "sent") return { ok: true };
    return { ok: false, error: "concurrent_or_not_pending" };
  }

  const job = claimed as WhatsAppQueueRow;
  const payload = parsePayload(job);
  if (!payload) {
    const msg = "invalid_queue_payload";
    await admin
      .from("whatsapp_queue")
      .update({
        status: "dead",
        attempts: MAX_WHATSAPP_QUEUE_DELIVERY_ATTEMPTS,
        last_error: msg,
        next_attempt_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId)
      .eq("status", "processing");
    await logWhatsAppQueueDead({ jobId, job, reason: msg, attempts: MAX_WHATSAPP_QUEUE_DELIVERY_ATTEMPTS });
    await sendTerminalQueueFailureSmsIfEligible(admin, job);
    return { ok: false, error: msg };
  }

  try {
    const { data: preSend, error: preErr } = await admin.from("whatsapp_queue").select("status").eq("id", jobId).maybeSingle();
    if (preErr) {
      await admin
        .from("whatsapp_queue")
        .update({ status: "pending", updated_at: new Date().toISOString() })
        .eq("id", jobId)
        .eq("status", "processing");
      return { ok: false, error: preErr.message };
    }
    const preSt = String((preSend as { status?: string } | null)?.status ?? "");
    if (preSt === "sent") {
      return { ok: true };
    }
    if (preSt !== "processing") {
      return { ok: false, error: "concurrent_or_not_processing" };
    }

    let messageId: string;
    if (payload.kind === "template") {
      const r = await sendViaMetaWhatsAppTemplateBody({
        phone: job.phone,
        templateName: payload.templateName,
        languageCode: payload.language ?? "en",
        bodyParameters: payload.bodyParams,
        recipientRole: "cleaner",
      });
      if (!r.ok) {
        throw new Error(r.error ?? "whatsapp_template_send_failed");
      }
      messageId = r.messageId!;
    } else {
      const r = await sendViaMetaWhatsApp({ phone: job.phone, message: payload.text, recipientRole: "cleaner" });
      if (!r.ok) {
        throw new Error(r.error ?? "whatsapp_text_send_failed");
      }
      messageId = r.messageId!;
    }

    await admin
      .from("whatsapp_queue")
      .update({
        status: "sent",
        meta_message_id: messageId,
        last_error: null,
        delivery_status: "sent",
        next_attempt_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId)
      .eq("status", "processing");

    const jobContext =
      typeof job.context === "object" && job.context !== null && !Array.isArray(job.context)
        ? (job.context as Record<string, unknown>)
        : {};
    if (shouldLogQueueDeliveredSuccess()) {
      await logSystemEvent({
        level: "info",
        source: "whatsapp_queue_delivered",
        message: "WhatsApp queue job sent",
        context: { job_id: jobId, meta_message_id: messageId, ...jobContext },
      });
    }
    return { ok: true };
  } catch (e) {
    const msg = (e instanceof Error ? e.message : String(e)).slice(0, 2000);
    const attempts = job.attempts + 1;
    const isDead = attempts >= MAX_WHATSAPP_QUEUE_DELIVERY_ATTEMPTS;
    const nextStatus = isDead ? "dead" : "pending";
    const circuitSoft = !isDead && isMetaCircuitPauseQueueError(msg);
    const circuitCap = Number(process.env.WHATSAPP_QUEUE_CIRCUIT_RETRY_MAX_MS ?? "25000");
    const capMs = Number.isFinite(circuitCap) && circuitCap >= 5000 ? circuitCap : 25_000;
    const backoffMs = !isDead ? whatsappQueueRetryDelayMs(attempts) : 0;
    const nextAttemptAt = isDead
      ? null
      : new Date(
          Date.now() + (circuitSoft ? Math.min(backoffMs, capMs) : backoffMs),
        ).toISOString();

    await admin
      .from("whatsapp_queue")
      .update({
        status: nextStatus,
        attempts,
        last_error: msg,
        next_attempt_at: nextAttemptAt,
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId)
      .eq("status", "processing");

    if (isDead) {
      await logWhatsAppQueueDead({ jobId, job, reason: msg, attempts });
    } else {
      await logSystemEvent({
        level: "warn",
        source: "whatsapp_queue_delivery_failed",
        message: msg,
        context: {
          job_id: jobId,
          attempts,
          next_status: nextStatus,
          next_attempt_at: nextAttemptAt,
        },
      });
      await logSystemEvent({
        level: "warn",
        source: "whatsapp_queue_failed",
        message: msg,
        context: {
          job_id: jobId,
          attempts,
          next_status: nextStatus,
          next_attempt_at: nextAttemptAt,
        },
      });
    }

    if (isDead) {
      await sendTerminalQueueFailureSmsIfEligible(admin, job);
    }

    return { ok: false, error: msg, meta_circuit_retry_scheduled: circuitSoft };
  }
}

/** Mark a job terminal failed so cron will not deliver after SMS fallback / failed admin retry. */
export async function abortWhatsAppQueueJob(
  admin: SupabaseClient,
  jobId: string,
  reason: string,
): Promise<void> {
  await admin
    .from("whatsapp_queue")
    .update({
      status: "failed",
      last_error: reason.slice(0, 2000),
      next_attempt_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId)
    .in("status", ["pending", "processing"]);
}

export type WhatsAppQueueStatusCounts = {
  pending: number;
  processing: number;
  sent: number;
  failed: number;
  dead: number;
  /** `pending` rows that have already failed at least once (waiting on backoff). */
  pending_retry: number;
};

function parseMetricsJson(data: unknown): WhatsAppQueueStatusCounts | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const j = data as Record<string, unknown>;
  const n = (k: string) => {
    const v = j[k];
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

/** Queue depth via RPC `get_whatsapp_queue_status_metrics` (single `GROUP BY`); falls back to head counts if needed. */
export async function getWhatsAppQueueStatusCounts(admin: SupabaseClient): Promise<WhatsAppQueueStatusCounts> {
  const { data: raw, error } = await admin.rpc("get_whatsapp_queue_status_metrics");
  let data: unknown = raw;
  if (typeof raw === "string") {
    try {
      data = JSON.parse(raw) as unknown;
    } catch {
      data = null;
    }
  }
  if (!error) {
    const parsed = parseMetricsJson(data);
    if (parsed) return parsed;
  }
  const statuses = ["pending", "processing", "sent", "failed", "dead"] as const;
  const parts = await Promise.all(
    statuses.map(async (st) => {
      const { count, error: cErr } = await admin.from("whatsapp_queue").select("*", { count: "exact", head: true }).eq("status", st);
      return { st, n: cErr ? 0 : count ?? 0 };
    }),
  );
  const by = Object.fromEntries(parts.map(({ st, n }) => [st, n])) as Record<(typeof statuses)[number], number>;
  const { count: retryCount } = await admin
    .from("whatsapp_queue")
    .select("*", { count: "exact", head: true })
    .eq("status", "pending")
    .gt("attempts", 0);
  return {
    pending: by.pending,
    processing: by.processing,
    sent: by.sent,
    failed: by.failed,
    dead: by.dead,
    pending_retry: retryCount ?? 0,
  };
}

/** Drain pending jobs (used by Vercel cron). Uses RPC `get_pending_whatsapp_jobs` when available. */
export async function processWhatsAppPendingBatch(params: {
  admin: SupabaseClient;
  limit?: number;
  /** When true, runs {@link getWhatsAppQueueStatusCounts} (one RPC + optional fallback). */
  includeQueueMetrics?: boolean;
}): Promise<{
  processed: number;
  ok: number;
  failed: number;
  queue_metrics?: WhatsAppQueueStatusCounts;
  worker_meta?: {
    batch_limit_requested: number;
    batch_limit_effective: number;
    queue_depth_proxy: number;
    duration_ms: number;
    meta_circuit_open_remaining_ms: number;
    circuit_retry_scheduled: number;
  };
}> {
  const t0 = Date.now();
  const limitRequested = Math.min(50, Math.max(1, params.limit ?? 15));

  await recoverStaleProcessingWhatsAppJobs(params.admin);

  const counts0 = await getWhatsAppQueueStatusCounts(params.admin);
  const depth = counts0.pending + counts0.processing;
  const backThresh = Number(process.env.WHATSAPP_QUEUE_BACKPRESSURE_THRESHOLD ?? "1000");
  let limitEffective = limitRequested;
  if (Number.isFinite(backThresh) && backThresh > 0 && depth > backThresh) {
    limitEffective = Math.max(3, Math.floor(limitRequested / 2));
  } else if (depth > 500) {
    limitEffective = Math.max(3, limitRequested - 3);
  }
  const limit = Math.min(limitRequested, limitEffective);

  const { ids, rpc_error } = await listPendingWhatsAppJobIds(params.admin, limit);
  if (!ids.length && rpc_error) {
    await logSystemEvent({
      level: "warn",
      source: "whatsapp_queue_worker_query",
      message: rpc_error,
      context: {},
    });
  } else if (rpc_error) {
    await logSystemEvent({
      level: "info",
      source: "whatsapp_queue_worker_rpc",
      message: "get_pending_whatsapp_jobs failed — used table scan fallback",
      context: { rpc_error },
    });
  }
  if (!ids.length) {
    const queue_metrics = params.includeQueueMetrics ? counts0 : undefined;
    return {
      processed: 0,
      ok: 0,
      failed: 0,
      queue_metrics,
      worker_meta: {
        batch_limit_requested: limitRequested,
        batch_limit_effective: limit,
        queue_depth_proxy: depth,
        duration_ms: Date.now() - t0,
        meta_circuit_open_remaining_ms: metaCircuitOpenRemainingMs(),
        circuit_retry_scheduled: 0,
      },
    };
  }

  let ok = 0;
  let failed = 0;
  let circuitRetryScheduled = 0;
  for (const id of ids) {
    const out = await flushWhatsAppJobById(params.admin, id);
    if (out.ok) ok++;
    else {
      failed++;
      if (out.meta_circuit_retry_scheduled) circuitRetryScheduled++;
    }
  }
  const queue_metrics = params.includeQueueMetrics ? await getWhatsAppQueueStatusCounts(params.admin) : undefined;
  return {
    processed: ids.length,
    ok,
    failed,
    queue_metrics,
    worker_meta: {
      batch_limit_requested: limitRequested,
      batch_limit_effective: limit,
      queue_depth_proxy: depth,
      duration_ms: Date.now() - t0,
      meta_circuit_open_remaining_ms: metaCircuitOpenRemainingMs(),
      circuit_retry_scheduled: circuitRetryScheduled,
    },
  };
}
