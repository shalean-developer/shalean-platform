export const PAYOUT_ATTRIBUTION_REMOVAL_METADATA_KEY = "payout_attribution_removal_v1";

export type PayoutAttributionRemovalMarker = {
  active: true;
  cleaner_id: string;
  removed_at: string;
  removed_by_admin_id: string;
  reason: string | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function readPayoutAttributionRemovalMarker(metadata: unknown): PayoutAttributionRemovalMarker | null {
  const root = asRecord(metadata);
  const raw = asRecord(root?.[PAYOUT_ATTRIBUTION_REMOVAL_METADATA_KEY]);
  if (!raw || raw.active !== true) return null;
  const cleanerId = String(raw.cleaner_id ?? "").trim();
  const removedAt = String(raw.removed_at ?? "").trim();
  const removedBy = String(raw.removed_by_admin_id ?? "").trim();
  if (!cleanerId || !removedAt || !removedBy) return null;
  return {
    active: true,
    cleaner_id: cleanerId,
    removed_at: removedAt,
    removed_by_admin_id: removedBy,
    reason: typeof raw.reason === "string" && raw.reason.trim() ? raw.reason.trim() : null,
  };
}

export function bookingHasActivePayoutAttributionRemoval(
  row: { metadata?: unknown; cleaner_id?: string | null; payout_owner_cleaner_id?: string | null },
): boolean {
  const marker = readPayoutAttributionRemovalMarker(row.metadata);
  if (!marker) return false;
  const primary =
    String(row.cleaner_id ?? "").trim() ||
    String(row.payout_owner_cleaner_id ?? "").trim();
  return primary !== "" && primary === marker.cleaner_id;
}

export function withPayoutAttributionRemovalMarker(
  metadata: unknown,
  marker: PayoutAttributionRemovalMarker,
): Record<string, unknown> {
  const root = asRecord(metadata);
  return {
    ...(root ?? {}),
    [PAYOUT_ATTRIBUTION_REMOVAL_METADATA_KEY]: marker,
  };
}
