import type { SupabaseClient } from "@supabase/supabase-js";
import type { WorkerConfig } from "../_shared/config.ts";
import { sendViaMetaWhatsApp, sendViaMetaWhatsAppTemplate } from "../_shared/metaSend.ts";
import { logSystemEvent } from "../_shared/logger.ts";
import {
  isMetaCircuitPauseQueueError,
  parseQueuePayload,
  whatsappQueueRetryDelayMs,
} from "./queueUtils.ts";
import { MAX_WHATSAPP_QUEUE_DELIVERY_ATTEMPTS, type WhatsAppQueueRow } from "./types.ts";

async function logQueueDead(
  admin: SupabaseClient,
  params: { jobId: string; job: WhatsAppQueueRow; reason: string; attempts?: number },
): Promise<void> {
  await logSystemEvent({
    level: "error",
    source: "whatsapp_queue_dead",
    message: params.reason.slice(0, 500),
    context: {
      job_id: params.jobId,
      attempts: params.attempts ?? params.job.attempts,
      type: params.job.type,
      runtime: "supabase_edge",
    },
    admin,
  });
}

/** Claim pending → processing, send via Meta, update sent / pending / dead. */
export async function flushWhatsAppJobById(
  admin: SupabaseClient,
  cfg: WorkerConfig,
  jobId: string,
): Promise<{ ok: boolean; error?: string; meta_circuit_retry_scheduled?: boolean }> {
  const { data: row0, error: readErr } = await admin.from("whatsapp_queue").select("*").eq("id", jobId).maybeSingle();
  if (readErr || !row0) return { ok: false, error: "job_not_found" };

  const row = row0 as WhatsAppQueueRow;
  if (row.status === "sent") return { ok: true };
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

  if (claimErr) return { ok: false, error: claimErr.message };
  if (!claimed) {
    const { data: again } = await admin.from("whatsapp_queue").select("status").eq("id", jobId).maybeSingle();
    if (String((again as { status?: string } | null)?.status ?? "") === "sent") return { ok: true };
    return { ok: false, error: "concurrent_or_not_pending" };
  }

  const job = claimed as WhatsAppQueueRow;
  const payload = parseQueuePayload(job);
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
    await logQueueDead(admin, { jobId, job, reason: msg, attempts: MAX_WHATSAPP_QUEUE_DELIVERY_ATTEMPTS });
    return { ok: false, error: msg };
  }

  try {
    let messageId: string;
    if (payload.kind === "template") {
      const r = await sendViaMetaWhatsAppTemplate(
        cfg,
        job.phone,
        payload.templateName,
        payload.language ?? "en",
        payload.bodyParams,
      );
      if (!r.ok) throw new Error(r.error ?? "whatsapp_template_send_failed");
      messageId = r.messageId;
    } else {
      const r = await sendViaMetaWhatsApp(cfg, job.phone, payload.text);
      if (!r.ok) throw new Error(r.error ?? "whatsapp_text_send_failed");
      messageId = r.messageId;
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

    return { ok: true };
  } catch (e) {
    const msg = (e instanceof Error ? e.message : String(e)).slice(0, 2000);
    const attempts = job.attempts + 1;
    const isDead = attempts >= MAX_WHATSAPP_QUEUE_DELIVERY_ATTEMPTS;
    const nextStatus = isDead ? "dead" : "pending";
    const circuitSoft = !isDead && isMetaCircuitPauseQueueError(msg);
    const backoffMs = !isDead
      ? whatsappQueueRetryDelayMs(attempts, cfg.whatsappQueueRetryBaseSec)
      : 0;
    const cappedBackoff = circuitSoft
      ? Math.min(backoffMs, cfg.whatsappQueueCircuitRetryMaxMs)
      : backoffMs;
    const nextAttemptAt = isDead ? null : new Date(Date.now() + cappedBackoff).toISOString();

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
      await logQueueDead(admin, { jobId, job, reason: msg, attempts });
    } else {
      await logSystemEvent({
        level: "warn",
        source: "whatsapp_queue_delivery_failed",
        message: msg,
        context: { job_id: jobId, attempts, next_status: nextStatus, runtime: "supabase_edge" },
        admin,
      });
    }

    return { ok: false, error: msg, meta_circuit_retry_scheduled: circuitSoft };
  }
}
