import type { MonthlyInvoiceSnapshotV1 } from "@/lib/monthlyInvoice/buildMonthlyInvoiceSnapshot";
import {
  buildInvoiceHumanTimeline,
  type InvoiceTimelineDbEvent,
} from "@/lib/monthlyInvoice/buildInvoiceHumanTimeline";

function asRecord(x: unknown): Record<string, unknown> | null {
  return x != null && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : null;
}

export function parseMonthlyInvoiceSnapshotV1(raw: unknown): MonthlyInvoiceSnapshotV1 | null {
  const o = asRecord(raw);
  if (!o) return null;
  if (Number(o.version) !== 1) return null;
  if (typeof o.invoice_id !== "string" || typeof o.customer_id !== "string" || typeof o.month !== "string") {
    return null;
  }
  const totals = asRecord(o.totals);
  if (!totals) return null;
  return o as unknown as MonthlyInvoiceSnapshotV1;
}

/**
 * Maps a `monthly_invoices` row + optional full event log into {@link buildInvoiceHumanTimeline} input.
 * Use this from admin UI so callers pass `{ invoice, fullEventHistory }` as a single object.
 */
export function buildInvoiceHumanTimelineForAdmin(params: {
  invoice: Record<string, unknown>;
  fullEventHistory?: InvoiceTimelineDbEvent[] | null;
}): string[] {
  const inv = params.invoice;
  const finalizedAt = typeof inv.finalized_at === "string" ? inv.finalized_at : null;
  const totalCents = Math.round(Number(inv.total_amount_cents ?? 0));

  return buildInvoiceHumanTimeline({
    finalizedAtIso: finalizedAt,
    totalAmountCentsAtFinalize: Number.isFinite(totalCents) ? totalCents : null,
    snapshotAtFinalize: parseMonthlyInvoiceSnapshotV1(inv.snapshot_at_finalize),
    snapshotCurrent: asRecord(inv.snapshot_current) ?? undefined,
    fullEventHistory: params.fullEventHistory?.length ? params.fullEventHistory : null,
  });
}
