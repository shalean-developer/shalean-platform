import type { SupabaseClient } from "@supabase/supabase-js";
import { canAdvanceWhatsAppDeliveryStatus } from "@/lib/whatsapp/deliveryState";
import { classifyMetaWhatsappDeliveryFailure } from "@/lib/whatsapp/metaDeliveryFailureCategory";
import { logSystemEvent } from "@/lib/logging/systemLog";

type MetaStatus = {
  id?: string;
  status?: string;
  recipient_id?: string;
  errors?: unknown;
  timestamp?: string | number;
};

const WHATSAPP_LOG_WEBHOOK_ERR_MAX = 4000;

function metaStatusTimestampIso(entry: MetaStatus): string {
  const raw = entry.timestamp;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return new Date(raw * 1000).toISOString();
  }
  if (typeof raw === "string" && /^\d+$/.test(raw.trim())) {
    return new Date(Number(raw.trim()) * 1000).toISOString();
  }
  return new Date().toISOString();
}

function sanitizeStatusPayloadForLog(entry: MetaStatus): Record<string, unknown> {
  try {
    const o = JSON.parse(JSON.stringify(entry)) as Record<string, unknown>;
    delete o.recipient_id;
    return o;
  } catch {
    return { status: entry.status, id: entry.id };
  }
}

async function resolveBookingCleanerForWaMessage(
  admin: SupabaseClient,
  waMessageId: string,
): Promise<{ booking_id: string | null; cleaner_id: string | null }> {
  const { data: offer } = await admin
    .from("dispatch_offers")
    .select("booking_id, cleaner_id")
    .eq("offer_whatsapp_message_id", waMessageId)
    .maybeSingle();
  const o = offer as { booking_id?: string; cleaner_id?: string } | null;
  if (o?.booking_id) {
    return {
      booking_id: String(o.booking_id),
      cleaner_id: o.cleaner_id ? String(o.cleaner_id) : null,
    };
  }
  const { data: log } = await admin
    .from("whatsapp_logs")
    .select("booking_id")
    .eq("meta_message_id", waMessageId)
    .maybeSingle();
  const b = (log as { booking_id?: string } | null)?.booking_id;
  return { booking_id: b ? String(b) : null, cleaner_id: null };
}

async function insertWhatsappDeliveryEventIdempotent(params: {
  admin: SupabaseClient;
  messageId: string;
  status: "sent" | "delivered" | "read" | "failed";
  eventAtIso: string;
  failureCategory?: string | null;
}): Promise<void> {
  const { booking_id, cleaner_id } = await resolveBookingCleanerForWaMessage(params.admin, params.messageId);
  const row = {
    message_id: params.messageId,
    status: params.status,
    event_at: params.eventAtIso,
    booking_id,
    cleaner_id,
    failure_category: params.status === "failed" ? params.failureCategory ?? "unknown" : null,
  };
  const { error } = await params.admin.from("whatsapp_delivery_events").upsert(row, {
    onConflict: "message_id,status",
    ignoreDuplicates: true,
  });
  if (error && !/duplicate key|unique constraint/i.test(error.message)) {
    console.error("[whatsapp_delivery_events] insert failed", {
      messageId: params.messageId,
      status: params.status,
      message: error.message,
    });
  }
}

async function patchDispatchOfferFirstDelivered(params: {
  admin: SupabaseClient;
  waMessageId: string;
  deliveredAtIso: string;
}): Promise<void> {
  const { error } = await params.admin
    .from("dispatch_offers")
    .update({ first_delivered_at: params.deliveredAtIso })
    .eq("offer_whatsapp_message_id", params.waMessageId)
    .is("first_delivered_at", null);
  if (error) {
    console.error("[dispatch_offers] first_delivered_at patch failed", {
      waMessageId: params.waMessageId,
      message: error.message,
    });
  }
}

async function patchDispatchOfferFirstRead(params: {
  admin: SupabaseClient;
  waMessageId: string;
  readAtIso: string;
}): Promise<void> {
  const { error } = await params.admin
    .from("dispatch_offers")
    .update({ first_read_at: params.readAtIso })
    .eq("offer_whatsapp_message_id", params.waMessageId)
    .is("first_read_at", null);
  if (error) {
    console.error("[dispatch_offers] first_read_at patch failed", { waMessageId: params.waMessageId, message: error.message });
  }
}

/**
 * Updates `whatsapp_logs` for outbound booking notifications by Meta `wamid`.
 * Never throws.
 */
async function updateWhatsappLogFromMetaDelivery(
  admin: SupabaseClient,
  waMessageId: string,
  metaStatus: string,
  statusEntry: MetaStatus,
  eventAtIso: string,
  failureCategory: string | null,
): Promise<void> {
  try {
    const stLower = metaStatus.toLowerCase();
    if (!["sent", "delivered", "read", "failed"].includes(stLower)) return;

    const webhook_payload = sanitizeStatusPayloadForLog(statusEntry) as Record<string, unknown>;

    const { data: cur } = await admin
      .from("whatsapp_logs")
      .select("status, meta_receipt_status, first_read_at")
      .eq("meta_message_id", waMessageId)
      .maybeSingle();

    if (!cur) return;

    const row = cur as {
      status?: string;
      meta_receipt_status?: string | null;
      first_read_at?: string | null;
    };

    let effPrev = String(row.meta_receipt_status ?? "").trim().toLowerCase();
    if (!effPrev && String(row.status ?? "").toLowerCase() === "sent") {
      effPrev = "sent";
    }

    if (!canAdvanceWhatsAppDeliveryStatus(effPrev || null, stLower)) {
      return;
    }

    const error_message =
      stLower === "failed"
        ? JSON.stringify(statusEntry.errors ?? {}).slice(0, WHATSAPP_LOG_WEBHOOK_ERR_MAX)
        : null;

    const patch: Record<string, unknown> = {
      webhook_payload,
      meta_receipt_status: stLower,
    };

    if (stLower === "failed") {
      patch.status = "failed_delivery";
      patch.error_message = error_message;
      patch.failure_category = failureCategory ?? "unknown";
    } else if (stLower !== "failed") {
      patch.error_message = null;
    }

    if (stLower === "read" && !row.first_read_at) {
      patch.first_read_at = eventAtIso;
    }

    const { error } = await admin.from("whatsapp_logs").update(patch).eq("meta_message_id", waMessageId);

    if (error) {
      console.error("[whatsapp_logs] Meta delivery webhook update failed", {
        waMessageId,
        metaStatus,
        message: error.message,
      });
    }
  } catch (err) {
    console.error("[whatsapp_logs] Meta delivery webhook update threw", {
      waMessageId,
      metaStatus,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

function collectStatuses(payload: unknown): MetaStatus[] {
  const out: MetaStatus[] = [];
  const p = payload as {
    entry?: Array<{ changes?: Array<{ value?: { statuses?: MetaStatus[] } }> }>;
  };
  for (const e of p?.entry ?? []) {
    for (const c of e?.changes ?? []) {
      const arr = c?.value?.statuses;
      if (Array.isArray(arr)) {
        for (const s of arr) {
          if (s && typeof s === "object") out.push(s as MetaStatus);
        }
      }
    }
  }
  return out;
}

/**
 * Persist Meta delivery receipts (`sent`, `delivered`, `read`, `failed`) to
 * `whatsapp_delivery_events`, `whatsapp_logs`, `dispatch_offers.first_read_at`, and `whatsapp_queue`.
 * Never throws; idempotent per (message_id, status). Avoids logging PII from Meta payloads.
 */
export async function recordWhatsAppDeliveryStatuses(
  admin: SupabaseClient | null,
  payload: unknown,
): Promise<void> {
  try {
    const statuses = collectStatuses(payload);
    for (const s of statuses) {
      const waId = typeof s.id === "string" ? s.id : "";
      const st = typeof s.status === "string" ? s.status.trim().toLowerCase() : "";
      if (!waId || !st) continue;

      if (!["sent", "delivered", "read", "failed"].includes(st)) continue;

      const eventAtIso = metaStatusTimestampIso(s);
      const failureCategory = st === "failed" ? classifyMetaWhatsappDeliveryFailure(s.errors) : null;

      if (st === "failed") {
        await logSystemEvent({
          level: "warn",
          source: "whatsapp_delivery_status",
          message: `Meta WA delivery failed (${failureCategory})`,
          context: {
            wa_message_id: waId,
            status: st,
            failure_category: failureCategory,
          },
        });
      }

      if (admin) {
        await insertWhatsappDeliveryEventIdempotent({
          admin,
          messageId: waId,
          status: st as "sent" | "delivered" | "read" | "failed",
          eventAtIso,
          failureCategory,
        });
        await updateWhatsappLogFromMetaDelivery(admin, waId, st, s, eventAtIso, failureCategory);
        if (st === "delivered") {
          await patchDispatchOfferFirstDelivered({ admin, waMessageId: waId, deliveredAtIso: eventAtIso });
        }
        if (st === "read") {
          await patchDispatchOfferFirstRead({ admin, waMessageId: waId, readAtIso: eventAtIso });
        }
      }

      if (admin) {
        const now = new Date().toISOString();
        const { data: row, error: rowErr } = await admin
          .from("whatsapp_queue")
          .select("id,delivery_status")
          .eq("meta_message_id", waId)
          .eq("status", "sent")
          .maybeSingle();

        if (rowErr || !row || typeof (row as { id?: unknown }).id !== "string") {
          continue;
        }

        const prev = (row as { delivery_status?: string | null }).delivery_status ?? null;
        if (!canAdvanceWhatsAppDeliveryStatus(prev, st)) {
          await logSystemEvent({
            level: "info",
            source: "whatsapp_delivery_status_skipped",
            message: "Ignored out-of-order Meta delivery status",
            context: { wa_message_id: waId, previous: prev, incoming: st },
          });
          continue;
        }

        const id = (row as { id: string }).id;
        if (st === "failed") {
          await admin
            .from("whatsapp_queue")
            .update({
              delivery_status: st,
              last_error: `delivery_failed: ${JSON.stringify(s.errors ?? {}).slice(0, 800)}`,
              updated_at: now,
            })
            .eq("id", id)
            .eq("status", "sent");
        } else {
          await admin
            .from("whatsapp_queue")
            .update({
              delivery_status: st,
              updated_at: now,
            })
            .eq("id", id)
            .eq("status", "sent");
        }
      }
    }
  } catch (err) {
    console.error("[recordWhatsAppDeliveryStatuses] unexpected error", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
