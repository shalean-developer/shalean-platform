export type ClaimBookingEarningsRecomputeResult = {
  claimed: boolean;
  /** ISO timestamp when the next successful claim is allowed (always set when booking row existed). */
  next_allowed_at: string | null;
};

/** PostgREST returns one row per `returns table` RPC as an array of objects. */
export function parseClaimBookingEarningsRecomputeRpc(data: unknown): ClaimBookingEarningsRecomputeResult | null {
  if (!Array.isArray(data) || data.length === 0) return null;
  const r = data[0] as Record<string, unknown>;
  const claimed = r.claimed === true;
  const raw = r.next_allowed_at;
  const next_allowed_at =
    typeof raw === "string" ? raw : raw === null || raw === undefined ? null : String(raw);
  return { claimed, next_allowed_at };
}
