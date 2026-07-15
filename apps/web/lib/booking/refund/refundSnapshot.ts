import type { RefundProviderState } from "@/lib/booking/refund/refundStateMachine";

export type BookingRefundRecord = {
  id: string;
  amount_cents: number;
  currency: string;
  kind: "full" | "partial";
  reason: string | null;
  cancellation_reason: string | null;
  provider_state: RefundProviderState;
  provider_reference: string | null;
  /** Sanitized provider outcome message (no secrets / card data). */
  provider_outcome: string | null;
  record_only: boolean;
  requested_by: string | null;
  requested_by_email: string | null;
  approved_by: string | null;
  approved_by_email: string | null;
  retry_count: number;
  created_at: string;
  updated_at: string;
  succeeded_at: string | null;
  failed_at: string | null;
};

export type BookingRefundPendingProposal = {
  id: string;
  amount_cents: number | null;
  reason: string | null;
  cancellation_reason: string | null;
  record_only: boolean;
  refund_reference: string | null;
  proposed_by: string;
  proposed_by_email: string | null;
  proposed_at: string;
  expires_at: string;
};

export type BookingRefundWorkflow = {
  version: 1;
  /** Immutable original capture at first refund workflow touch. */
  captured_cents: number;
  currency: string;
  /** Sum of succeeded refund amounts. */
  refunded_cents: number;
  records: BookingRefundRecord[];
  pending_proposal: BookingRefundPendingProposal | null;
};

export function readRefundWorkflow(snapshot: unknown): BookingRefundWorkflow | null {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return null;
  const raw = (snapshot as { refund_workflow?: unknown }).refund_workflow;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const wf = raw as Partial<BookingRefundWorkflow>;
  if (wf.version !== 1) return null;
  const captured = Number(wf.captured_cents);
  const refunded = Number(wf.refunded_cents);
  if (!Number.isFinite(captured) || captured < 0) return null;
  return {
    version: 1,
    captured_cents: Math.round(captured),
    currency: typeof wf.currency === "string" && wf.currency.trim() ? wf.currency.trim().toUpperCase() : "ZAR",
    refunded_cents: Number.isFinite(refunded) && refunded > 0 ? Math.round(refunded) : 0,
    records: Array.isArray(wf.records) ? (wf.records as BookingRefundRecord[]) : [],
    pending_proposal:
      wf.pending_proposal && typeof wf.pending_proposal === "object"
        ? (wf.pending_proposal as BookingRefundPendingProposal)
        : null,
  };
}

export function priorSucceededRefundedCents(workflow: BookingRefundWorkflow | null): number {
  if (!workflow) return 0;
  const fromRecords = workflow.records
    .filter((r) => r.provider_state === "succeeded")
    .reduce((sum, r) => sum + Math.max(0, Math.round(r.amount_cents)), 0);
  return Math.max(fromRecords, workflow.refunded_cents);
}

export function mergeRefundWorkflowIntoSnapshot(
  snapshot: unknown,
  workflow: BookingRefundWorkflow,
): Record<string, unknown> {
  const base =
    snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)
      ? { ...(snapshot as Record<string, unknown>) }
      : {};
  return { ...base, refund_workflow: workflow };
}

export function initRefundWorkflow(params: {
  capturedCents: number;
  currency?: string;
}): BookingRefundWorkflow {
  return {
    version: 1,
    captured_cents: Math.max(0, Math.round(params.capturedCents)),
    currency: (params.currency ?? "ZAR").toUpperCase(),
    refunded_cents: 0,
    records: [],
    pending_proposal: null,
  };
}

export function findRefundRecord(
  workflow: BookingRefundWorkflow,
  refundId: string,
): BookingRefundRecord | null {
  return workflow.records.find((r) => r.id === refundId) ?? null;
}

export function upsertRefundRecord(
  workflow: BookingRefundWorkflow,
  record: BookingRefundRecord,
): BookingRefundWorkflow {
  const idx = workflow.records.findIndex((r) => r.id === record.id);
  const records = [...workflow.records];
  if (idx >= 0) records[idx] = record;
  else records.push(record);
  const refunded_cents = records
    .filter((r) => r.provider_state === "succeeded")
    .reduce((sum, r) => sum + Math.max(0, Math.round(r.amount_cents)), 0);
  return { ...workflow, records, refunded_cents };
}
