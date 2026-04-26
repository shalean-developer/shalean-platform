import type { SupabaseClient } from "@supabase/supabase-js";
import { canAdvanceWhatsAppDeliveryStatus } from "@/lib/whatsapp/deliveryState";
import { logSystemEvent } from "@/lib/logging/systemLog";

type MetaStatus = {
  id?: string;
  status?: string;
  recipient_id?: string;
  errors?: unknown;
};

const WHATSAPP_LOG_WEBHOOK_ERR_MAX = 4000;

/** Map Meta message status webhook values to `whatsapp_logs.status`. */
function mapMetaStatusToWhatsappLogStatus(metaStatus: string): "sent" | "failed_delivery" | null {
  const st = metaStatus.toLowerCase();
  if (st === "sent" || st === "delivered" || st === "read") return "sent";
  if (st === "failed") return "failed_delivery";
  return null;
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
): Promise<void> {
  try {
    const nextStatus = mapMetaStatusToWhatsappLogStatus(metaStatus);
    if (!nextStatus) return;

    const stLower = metaStatus.toLowerCase();
    const webhook_payload = JSON.parse(JSON.stringify(statusEntry)) as Record<string, unknown>;

    const error_message =
      stLower === "failed"
        ? JSON.stringify(statusEntry.errors ?? {}).slice(0, WHATSAPP_LOG_WEBHOOK_ERR_MAX)
        : null;

    const { error } = await admin
      .from("whatsapp_logs")
      .update({
        status: nextStatus,
        webhook_payload,
        ...(stLower === "failed" ? { error_message } : { error_message: null }),
      })
      .eq("meta_message_id", waMessageId);

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

/** Persist Meta delivery receipts (`sent`, `delivered`, `read`, `failed`) to logs + optional queue row patch. */
export async function recordWhatsAppDeliveryStatuses(
  admin: SupabaseClient | null,
  payload: unknown,
): Promise<void> {
  try {
    const statuses = collectStatuses(payload);
    for (const s of statuses) {
    const waId = typeof s.id === "string" ? s.id : "";
    const st = typeof s.status === "string" ? s.status : "";
    await logSystemEvent({
      level: st === "failed" ? "warn" : "info",
      source: "whatsapp_delivery_status",
      message: `Meta WA status=${st || "unknown"}`,
      context: {
        wa_message_id: waId,
        status: st,
        recipient_id: s.recipient_id,
        errors: s.errors,
      },
    });

    if (admin && waId && st) {
      await updateWhatsappLogFromMetaDelivery(admin, waId, st, s);
    }

    if (admin && waId && st) {
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
