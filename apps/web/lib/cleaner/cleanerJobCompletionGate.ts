import { isStructuredPricingBreakdown } from "@/lib/booking-v2/types";
import {
  resolvePersistedBookingDurationMinutes,
  type BookingDurationRowLike,
} from "@/lib/booking/quote/bookingQuotePersistence";

/** Minimum share of quoted on-site duration before cleaner self-complete is allowed. */
export const CLEANER_COMPLETION_MIN_ELAPSED_RATIO = 0.9;

export type CleanerJobCompletionGateFailureCode =
  | "missing_persisted_duration"
  | "quote_signature_missing"
  | "minimum_duration_not_elapsed";

export type CleanerJobCompletionGateSuccess = {
  ok: true;
  durationMinutes: number;
  elapsedMinutes: number;
  requiredMinutes: number;
  earlyFinishApproved?: boolean;
  earlyFinishApprovalSource?: string | null;
};

export type CleanerJobCompletionGateFailure = {
  ok: false;
  code: CleanerJobCompletionGateFailureCode;
  error: string;
  blockedCodes: CleanerJobCompletionGateFailureCode[];
  remainingMinutes?: number;
  durationMinutes?: number | null;
  elapsedMinutes?: number | null;
  requiredMinutes?: number | null;
};

export type CleanerJobCompletionGateResult = CleanerJobCompletionGateSuccess | CleanerJobCompletionGateFailure;

export type CleanerJobCompletionGateRow = BookingDurationRowLike & {
  started_at?: string | null;
  booking_snapshot?: unknown | null;
};

function earlyFinishApprovalFromSnapshot(snapshot: unknown): { approved: boolean; source: string | null } {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return { approved: false, source: null };
  const marker = (snapshot as Record<string, unknown>).early_finish_approval;
  if (!marker || typeof marker !== "object" || Array.isArray(marker)) return { approved: false, source: null };
  const record = marker as Record<string, unknown>;
  const approvedAt = typeof record.approved_at === "string" ? record.approved_at.trim() : "";
  const source = typeof record.source === "string" ? record.source.trim() : "";
  const allowedSource = source === "customer" || source === "admin" || source === "supervisor" || source === "manager";
  return { approved: Boolean(approvedAt) && allowedSource, source: allowedSource ? source : null };
}

export function evaluateCleanerJobCompletionGate(
  row: CleanerJobCompletionGateRow,
  nowMs: number = Date.now(),
): CleanerJobCompletionGateResult {
  const durationMinutes = resolvePersistedBookingDurationMinutes(row);
  if (durationMinutes == null) {
    return { ok: false, code: "missing_persisted_duration", error: "Job duration is not on file yet. Contact support before completing.", blockedCodes: ["missing_persisted_duration"], durationMinutes: null };
  }

  const summary = isStructuredPricingBreakdown(row.pricing_summary) ? row.pricing_summary : null;
  if (summary) {
    const sig = summary.quote_signature;
    if (typeof sig !== "string" || !sig.trim()) {
      return { ok: false, code: "quote_signature_missing", error: "Job quote is not verified. Contact support before completing.", blockedCodes: ["quote_signature_missing"], durationMinutes };
    }
  }

  const elapsedMinutes = elapsedMinutesFromStartedAtRow(row.started_at, nowMs);
  if (elapsedMinutes == null) {
    return { ok: false, code: "minimum_duration_not_elapsed", error: "Start the job before completing so on-site time can be recorded.", blockedCodes: ["minimum_duration_not_elapsed"], durationMinutes, remainingMinutes: Math.ceil(durationMinutes * CLEANER_COMPLETION_MIN_ELAPSED_RATIO), requiredMinutes: Math.ceil(durationMinutes * CLEANER_COMPLETION_MIN_ELAPSED_RATIO) };
  }

  const requiredMinutes = durationMinutes * CLEANER_COMPLETION_MIN_ELAPSED_RATIO;
  if (elapsedMinutes + 1e-6 < requiredMinutes) {
    const earlyFinish = earlyFinishApprovalFromSnapshot(row.booking_snapshot);
    if (earlyFinish.approved) {
      return { ok: true, durationMinutes, elapsedMinutes, requiredMinutes, earlyFinishApproved: true, earlyFinishApprovalSource: earlyFinish.source };
    }
    const remainingMinutes = Math.max(1, Math.ceil(requiredMinutes - elapsedMinutes));
    return { ok: false, code: "minimum_duration_not_elapsed", error: `Allow at least ${Math.ceil(requiredMinutes)} minutes on site before completing (${remainingMinutes} min remaining).`, blockedCodes: ["minimum_duration_not_elapsed"], durationMinutes, elapsedMinutes, requiredMinutes, remainingMinutes };
  }

  return { ok: true, durationMinutes, elapsedMinutes, requiredMinutes };
}

function elapsedMinutesFromStartedAtRow(startedAt: string | null | undefined, nowMs: number): number | null {
  const raw = typeof startedAt === "string" ? startedAt.trim() : "";
  if (!raw) return null;
  const startMs = Date.parse(raw);
  if (!Number.isFinite(startMs)) return null;
  return Math.max(0, (nowMs - startMs) / 60_000);
}

export function buildAdminCompletionGateOverridePatch(params: { adminEmail?: string | null; adminUserId?: string | null; reason: string; blockedCodes: string[] }): Record<string, unknown> {
  const reason = params.reason.trim().slice(0, 500);
  return { admin_completion_gate_override_at: new Date().toISOString(), admin_completion_gate_override_by: (typeof params.adminEmail === "string" && params.adminEmail.trim()) || params.adminUserId || null, admin_completion_gate_override_reason: reason || null, admin_completion_gate_override_codes: params.blockedCodes };
}

export function mergeAdminCompletionGateOverrideUpdates(
  updates: Record<string, unknown>,
  params: { beforeRow: CleanerJobCompletionGateRow; adminEmail?: string | null; adminUserId?: string | null; reason: string; nowMs?: number },
): { gate: CleanerJobCompletionGateResult; overrideApplied: boolean } {
  const gate = evaluateCleanerJobCompletionGate(params.beforeRow, params.nowMs ?? Date.now());
  if (gate.ok) return { gate, overrideApplied: false };
  Object.assign(updates, buildAdminCompletionGateOverridePatch({ adminEmail: params.adminEmail, adminUserId: params.adminUserId, reason: params.reason, blockedCodes: gate.blockedCodes }));
  return { gate, overrideApplied: true };
}
