/** Shared validation for replacing `booking_cleaners` via `replace_booking_cleaners_admin_atomic`. */

export const BOOKING_ROSTER_MEMBER_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type RosterReplaceMemberInput = {
  cleanerId?: unknown;
  role?: unknown;
  payoutWeight?: unknown;
  leadBonusCents?: unknown;
};

export type ReplaceBookingCleanersRpcRow = {
  cleaner_id: string;
  role: string;
  payout_weight: number;
  lead_bonus_cents: number;
  source: string;
};

export type PreserveCleanerPayout = {
  payout_weight: number;
  lead_bonus_cents: number;
  source?: string | null;
};

/**
 * Validates members and builds JSON rows for `replace_booking_cleaners_admin_atomic`.
 * When `preserveByCleanerId` is set, existing cleaners keep prior payout_weight / lead_bonus_cents (and source if present).
 */
export function validateMembersToReplaceBookingCleanersRpcRows(
  members: RosterReplaceMemberInput[],
  options?: { preserveByCleanerId?: Map<string, PreserveCleanerPayout>; defaultSource?: string },
):
  | { ok: true; rows: ReplaceBookingCleanersRpcRow[] }
  | { ok: false; status: number; error: string } {
  if (!Array.isArray(members) || members.length < 1) {
    return { ok: false, status: 400, error: "members must be a non-empty array." };
  }

  const preserve = options?.preserveByCleanerId;
  const defaultSource =
    typeof options?.defaultSource === "string" && options.defaultSource.trim() ? options.defaultSource.trim() : "admin";
  const rpcRows: ReplaceBookingCleanersRpcRow[] = [];
  let leadCount = 0;
  const seen = new Set<string>();

  for (const m of members) {
    const cleanerId = typeof m.cleanerId === "string" ? m.cleanerId.trim() : "";
    if (!BOOKING_ROSTER_MEMBER_UUID_RE.test(cleanerId)) {
      return { ok: false, status: 400, error: "Invalid cleanerId in members." };
    }
    if (seen.has(cleanerId)) {
      return { ok: false, status: 400, error: "Duplicate cleanerId in members." };
    }
    seen.add(cleanerId);

    const role = typeof m.role === "string" ? m.role.trim().toLowerCase() : "";
    if (role !== "lead" && role !== "member") {
      return { ok: false, status: 400, error: "Each member.role must be lead or member." };
    }
    if (role === "lead") leadCount++;

    const preserved = preserve?.get(cleanerId);
    let payoutWeight = 1;
    let leadBonusCents = 0;
    let source = defaultSource;

    if (preserved) {
      payoutWeight = Number(preserved.payout_weight);
      if (!Number.isFinite(payoutWeight) || payoutWeight <= 0) payoutWeight = 1;
      leadBonusCents = Math.floor(Number(preserved.lead_bonus_cents));
      if (!Number.isFinite(leadBonusCents) || leadBonusCents < 0) leadBonusCents = 0;
      if (preserved.source != null && String(preserved.source).trim()) {
        source = String(preserved.source).trim();
      }
    } else {
      if (m.payoutWeight !== undefined && m.payoutWeight !== null) {
        const n = Number(m.payoutWeight);
        if (!Number.isFinite(n) || n <= 0) {
          return { ok: false, status: 400, error: "payoutWeight must be a positive number." };
        }
        payoutWeight = n;
      }
      if (m.leadBonusCents !== undefined && m.leadBonusCents !== null) {
        const b = Number(m.leadBonusCents);
        if (!Number.isInteger(b) || b < 0) {
          return { ok: false, status: 400, error: "leadBonusCents must be a non-negative integer." };
        }
        leadBonusCents = b;
      }
    }

    rpcRows.push({
      cleaner_id: cleanerId,
      role,
      payout_weight: payoutWeight,
      lead_bonus_cents: leadBonusCents,
      source,
    });
  }

  if (leadCount !== 1) {
    return { ok: false, status: 400, error: "Exactly one member must have role lead." };
  }

  return { ok: true, rows: rpcRows };
}
