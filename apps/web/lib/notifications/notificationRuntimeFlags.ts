import { logSystemEvent } from "@/lib/logging/systemLog";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const ROW_ID = 1;

async function logRuntimeFlagsIssue(message: string, context: Record<string, unknown>): Promise<void> {
  await logSystemEvent({
    level: "warn",
    source: "notification_runtime_flags",
    message,
    context,
  });
}

export type NotificationRuntimeFlagsRow = {
  whatsapp_disabled_until: string | null;
  whatsapp_paused_at: string | null;
};

export async function getNotificationRuntimeFlags(): Promise<NotificationRuntimeFlagsRow | null> {
  const admin = getSupabaseAdmin();
  if (!admin) return null;
  const { data, error } = await admin
    .from("notification_runtime_flags")
    .select("whatsapp_disabled_until, whatsapp_paused_at")
    .eq("id", ROW_ID)
    .maybeSingle();
  if (error) {
    await logRuntimeFlagsIssue("read_failed", { phase: "select", error: error.message });
    return null;
  }
  if (!data) return null;
  const row = data as {
    whatsapp_disabled_until?: string | null;
    whatsapp_paused_at?: string | null;
  };
  const until =
    typeof row.whatsapp_disabled_until === "string" && row.whatsapp_disabled_until.trim()
      ? row.whatsapp_disabled_until.trim()
      : null;
  const pausedAt =
    typeof row.whatsapp_paused_at === "string" && row.whatsapp_paused_at.trim()
      ? row.whatsapp_paused_at.trim()
      : null;
  return { whatsapp_disabled_until: until, whatsapp_paused_at: pausedAt };
}

export async function getWhatsappDisabledUntilIso(): Promise<string | null> {
  const row = await getNotificationRuntimeFlags();
  return row?.whatsapp_disabled_until ?? null;
}

export async function isWhatsappOutboundPaused(): Promise<{ paused: boolean; untilIso: string | null }> {
  const until = await getWhatsappDisabledUntilIso();
  if (!until) return { paused: false, untilIso: null };
  const t = new Date(until).getTime();
  if (!Number.isFinite(t) || t <= Date.now()) return { paused: false, untilIso: until };
  return { paused: true, untilIso: until };
}

/**
 * Sets global WhatsApp pause until `iso` (UTC). Pass null to clear.
 * Ensures singleton row id=1 exists (upsert). On new pause, sets `whatsapp_paused_at`; while extending an active pause, preserves prior `whatsapp_paused_at`.
 */
export async function setWhatsappDisabledUntil(iso: string | null): Promise<void> {
  const admin = getSupabaseAdmin();
  if (!admin) return;
  const updatedAt = new Date().toISOString();

  if (iso === null) {
    const { error } = await admin.from("notification_runtime_flags").upsert(
      {
        id: ROW_ID,
        whatsapp_disabled_until: null,
        whatsapp_paused_at: null,
        updated_at: updatedAt,
      },
      { onConflict: "id" },
    );
    if (error) {
      await logRuntimeFlagsIssue("write_failed", { phase: "upsert_clear", error: error.message });
    }
    return;
  }

  const row = await getNotificationRuntimeFlags();
  const nowMs = Date.now();
  const wasActive =
    row?.whatsapp_disabled_until != null &&
    new Date(row.whatsapp_disabled_until).getTime() > nowMs;
  const pausedAt =
    wasActive && row?.whatsapp_paused_at ? row.whatsapp_paused_at : new Date().toISOString();

  const { error } = await admin.from("notification_runtime_flags").upsert(
    {
      id: ROW_ID,
      whatsapp_disabled_until: iso,
      whatsapp_paused_at: pausedAt,
      updated_at: updatedAt,
    },
    { onConflict: "id" },
  );
  if (error) {
    await logRuntimeFlagsIssue("write_failed", { phase: "upsert_pause", error: error.message, cleared: false });
  }
}

/** Clears automatic WhatsApp pause (early recovery or manual). */
export async function clearWhatsappPause(): Promise<void> {
  await setWhatsappDisabledUntil(null);
}
