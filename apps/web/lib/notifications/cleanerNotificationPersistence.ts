import type { CleanerInAppNotification, CleanerNotificationKind } from "@/lib/notifications/types";

export const CLEANER_NOTIFICATIONS_STORAGE_PREFIX = "shalean.cleaner_notifications.v1";
export const CLEANER_NOTIFICATIONS_BC = "shalean-cleaner-notifications";
/** Cross-tab ping when `BroadcastChannel` is unavailable (Safari / throttling). */
export const CLEANER_NOTIFICATION_BC_STORAGE_KEY = "shalean.cleaner_notif_bc_ping";
export const CLEANER_NOTIFICATION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const CLEANER_NOTIFICATION_MAX_ITEMS = 40;
/** Guard localStorage payload size (bytes of JSON string). */
export const CLEANER_NOTIFICATION_MAX_SERIALIZED_CHARS = 200_000;

export type CleanerNotificationBcMessage =
  | { type: "append"; tabId: string; payload: CleanerInAppNotification }
  | { type: "mark_read"; tabId: string; ids: string[] }
  | { type: "mark_all_read"; tabId: string };

/** Parse `created_at` whether stored as ISO string or unix ms. */
export function notificationCreatedAtMs(n: Pick<CleanerInAppNotification, "created_at">): number {
  const raw = (n as { created_at?: string | number }).created_at as unknown;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  const ms = Date.parse(String(raw ?? ""));
  return Number.isFinite(ms) ? ms : 0;
}

export function normalizeNotificationCreatedAtIso(input?: string | number | null): string {
  if (typeof input === "number" && Number.isFinite(input)) {
    return new Date(input).toISOString();
  }
  const s = String(input ?? "").trim();
  if (!s) return new Date().toISOString();
  const ms = Date.parse(s);
  if (Number.isFinite(ms)) return new Date(ms).toISOString();
  return new Date().toISOString();
}

/** Single canonical dedupe key (persisted on rows as `dedupe_key`). */
export function buildNotificationDedupeKey(
  x: Pick<CleanerInAppNotification, "id" | "kind" | "booking_id" | "created_at" | "title" | "dedupe_key" | "offer_token">,
): string {
  const stored = String(x.dedupe_key ?? "").trim();
  if (stored) return stored;
  const id = String(x.id ?? "").trim();
  if (id) return `id:${id}`;
  const ot = String(x.offer_token ?? "").trim();
  if (ot && x.kind === "job_offer") return `job_offer|token:${ot}`;
  const ts = notificationCreatedAtMs(x as CleanerInAppNotification);
  const sec = Math.floor(ts / 1000);
  const k = x.kind ?? "system";
  const bid = String(x.booking_id ?? "").trim();
  return `${k}|${bid}|${sec}|${String(x.title ?? "").slice(0, 32)}`;
}

/** @deprecated use {@link buildNotificationDedupeKey} */
export function cleanerNotificationDedupeKey(
  x: Pick<CleanerInAppNotification, "id" | "kind" | "booking_id" | "created_at" | "title" | "dedupe_key" | "offer_token">,
): string {
  return buildNotificationDedupeKey(x);
}

function migrateKind(raw: unknown): CleanerNotificationKind | undefined {
  if (raw === "job_offer" || raw === "job_assigned" || raw === "payout_failed" || raw === "system") return raw;
  if (raw === "offer") return "job_offer";
  if (raw === "assignment") return "job_assigned";
  return undefined;
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return Boolean(x) && typeof x === "object" && !Array.isArray(x);
}

export function parseCleanerNotificationsFromStorage(raw: string): CleanerInAppNotification[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: CleanerInAppNotification[] = [];
  for (const row of parsed) {
    if (!isRecord(row)) continue;
    const id = typeof row.id === "string" ? row.id.trim() : "";
    const title = typeof row.title === "string" ? row.title : "";
    const body = typeof row.body === "string" ? row.body : "";
    const read = row.read === true;
    let created_at = "";
    if (typeof row.created_at === "number" && Number.isFinite(row.created_at)) {
      created_at = new Date(row.created_at).toISOString();
    } else if (typeof row.created_at === "string") {
      created_at = normalizeNotificationCreatedAtIso(row.created_at);
    }
    if (!id || !created_at) continue;
    const kind = migrateKind(row.kind);
    const booking_id = typeof row.booking_id === "string" ? row.booking_id.trim() : undefined;
    const offer_token = typeof row.offer_token === "string" ? row.offer_token.trim() : undefined;
    const dedupe_key = typeof row.dedupe_key === "string" ? row.dedupe_key.trim() : undefined;
    const item: CleanerInAppNotification = {
      id,
      title: title || "Update",
      body,
      read,
      created_at,
      kind,
      dedupe_key: dedupe_key || undefined,
    };
    if (booking_id) item.booking_id = booking_id;
    if (offer_token) item.offer_token = offer_token;
    item.dedupe_key = buildNotificationDedupeKey(item);
    out.push(item);
  }
  return out;
}

export function sortAndPruneCleanerNotifications(
  items: readonly CleanerInAppNotification[],
  nowMs: number = Date.now(),
): CleanerInAppNotification[] {
  const seen = new Set<string>();
  const deduped: CleanerInAppNotification[] = [];
  for (const x of items) {
    const k = buildNotificationDedupeKey(x);
    const row: CleanerInAppNotification = {
      ...x,
      dedupe_key: k,
      created_at: normalizeNotificationCreatedAtIso(x.created_at),
    };
    if (seen.has(k)) continue;
    seen.add(k);
    const t = notificationCreatedAtMs(row);
    if (!Number.isFinite(t) || t <= 0 || nowMs - t > CLEANER_NOTIFICATION_MAX_AGE_MS) continue;
    deduped.push(row);
  }
  deduped.sort((a, b) => notificationCreatedAtMs(b) - notificationCreatedAtMs(a));
  return deduped.slice(0, CLEANER_NOTIFICATION_MAX_ITEMS);
}
