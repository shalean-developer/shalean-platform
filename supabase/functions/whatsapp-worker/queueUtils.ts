import type { SupabaseClient } from "@supabase/supabase-js";
import type { WhatsAppQueuePayload } from "./types.ts";

export function parseQueuePayload(row: { type: string; payload: unknown }): WhatsAppQueuePayload | null {
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

const STALE_PROCESSING_MS = 2 * 60 * 1000;

export async function recoverStaleProcessingJobs(admin: SupabaseClient): Promise<number> {
  const staleBefore = new Date(Date.now() - STALE_PROCESSING_MS).toISOString();
  const nowIso = new Date().toISOString();
  const { data, error } = await admin
    .from("whatsapp_queue")
    .update({ status: "pending", next_attempt_at: nowIso, updated_at: nowIso })
    .eq("status", "processing")
    .is("next_attempt_at", null)
    .lt("updated_at", staleBefore)
    .select("id");

  if (error) return 0;
  return (data ?? []).length;
}

export function whatsappQueueRetryDelayMs(attemptsAfterFailure: number, baseSec: number): number {
  const base = Number.isFinite(baseSec) && baseSec > 0 ? Math.min(3600, baseSec) : 60;
  const a = Math.max(1, Math.floor(attemptsAfterFailure));
  const jitter = 0.9 + Math.random() * 0.2;
  return Math.round(base * 1000 * 2 ** a * jitter);
}

export function isMetaCircuitPauseQueueError(msg: string): boolean {
  return /circuit_open|send paused \(circuit|Meta WhatsApp send paused/i.test(msg);
}
