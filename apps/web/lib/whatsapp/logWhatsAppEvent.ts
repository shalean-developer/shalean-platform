import "server-only";

import { logSystemEvent } from "@/lib/logging/systemLog";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";

const MAX_ERR = 4000;

/**
 * Single structured audit path for cleaner WhatsApp delivery (system log + optional `whatsapp_logs` row).
 */
export type LogWhatsAppEventInput = {
  /** When set, a row is written to `whatsapp_logs`. Omitted = system log only (e.g. no booking). */
  booking_id?: string | null;
  cleaner_id?: string | null;
  template: string;
  status: "sent" | "failed";
  error?: string;
  /** Digits or E.164; stored normalized. */
  phone: string;
  message_type: "text" | "template";
  meta_message_id?: string;
};

export async function logWhatsAppEvent(
  admin: SupabaseClient | null | undefined,
  p: LogWhatsAppEventInput,
): Promise<void> {
  const errSlice = p.error?.slice(0, MAX_ERR);
  const phoneDigits = String(p.phone ?? "").replace(/\D/g, "");
  const phoneTail = phoneDigits.slice(-4);

  await logSystemEvent({
    level: p.status === "sent" ? "info" : "warn",
    source: "whatsapp_delivery",
    message: `WhatsApp ${p.status} ${p.message_type} ${p.template}`,
    context: {
      booking_id: p.booking_id ?? null,
      cleaner_id: p.cleaner_id ?? null,
      template: p.template,
      status: p.status,
      error: p.status === "failed" ? errSlice ?? null : null,
      phone_tail: phoneTail || null,
    },
  });

  const bid = p.booking_id?.trim();
  if (!bid) return;

  const client = admin ?? getSupabaseAdmin();
  if (!client) return;

  try {
    const { error } = await client.from("whatsapp_logs").insert({
      booking_id: bid,
      phone: phoneDigits.slice(0, 32) || "0",
      message_type: p.message_type,
      status: p.status,
      error_message: p.status === "failed" ? errSlice ?? "failed" : null,
      meta_message_id: p.meta_message_id ?? null,
    });
    if (error) {
      await logSystemEvent({
        level: "warn",
        source: "whatsapp_delivery",
        message: "whatsapp_logs insert failed",
        context: { booking_id: bid, supabase: error.message },
      });
    }
  } catch (e) {
    await logSystemEvent({
      level: "warn",
      source: "whatsapp_delivery",
      message: "whatsapp_logs insert threw",
      context: { booking_id: bid, error: e instanceof Error ? e.message : String(e) },
    });
  }
}
