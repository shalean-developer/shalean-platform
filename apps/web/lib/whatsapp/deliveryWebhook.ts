import type { SupabaseClient } from "@supabase/supabase-js";
import { canAdvanceWhatsAppDeliveryStatus } from "@/lib/whatsapp/deliveryState";
import { logSystemEvent } from "@/lib/logging/systemLog";

type MetaStatus = {
  id?: string;
  status?: string;
  recipient_id?: string;
  errors?: unknown;
};

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
}
