export const PAYOUT_ATTRIBUTION_REMOVAL_METADATA_KEY = "payout_attribution_removal_v1";

export type PayoutAttributionRemovalMarker = {
  active: true;
  cleaner_id: string;
  /** Booking header identity that existed when payout attribution was removed. */
  header_cleaner_id_at_removal: string | null;
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
    header_cleaner_id_at_removal:
      typeof raw.header_cleaner_id_at_removal === "string" && raw.header_cleaner_id_at_removal.trim()
        ? raw.header_cleaner_id_at_removal.trim()
        : null,
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
  // The removal stays authoritative while the booking header is unchanged from
  // removal time (including a temporarily empty header). A genuinely new header
  // assignment supersedes the marker and allows normal payout repair again.
  if (!primary) return true;
  const headerAtRemoval = marker.header_cleaner_id_at_removal || marker.cleaner_id;
  return primary === headerAtRemoval;
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
