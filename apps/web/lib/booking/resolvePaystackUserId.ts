import type { BookingSnapshotV1 } from "@/lib/booking/paystackChargeTypes";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseUuid(v: string | undefined | null): string | null {
  const s = v?.trim();
  if (!s || !UUID_RE.test(s)) return null;
  return s;
}

/**
 * Resolves DB user_id from Paystack charge data. Prefer snapshot (from server-built `booking_json`);
 * metadata keys are only used as fallback (still originate from our initialize payload on Paystack).
 */
export function resolvePaystackUserId(
  snapshot: BookingSnapshotV1 | null,
  metadata?: Record<string, string | undefined> | null,
): string | null {
  const fromSnapshot = parseUuid(snapshot?.customer?.user_id ?? undefined);
  if (fromSnapshot) return fromSnapshot;

  const fromMeta =
    parseUuid(metadata?.userId) ??
    parseUuid(metadata?.customer_user_id) ??
    parseUuid(typeof metadata?.user_id === "string" ? metadata.user_id : undefined);

  return fromMeta;
}
