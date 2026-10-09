import "server-only";

import type { BookingLineItemInsert } from "@/lib/booking/bookingLineItemTypes";

const SOURCE = "historical_team_snapshot_v1";

type SnapshotLine = { label?: unknown; amountZar?: unknown };
type SnapshotExtra = { name?: unknown; price?: unknown; extra_id?: unknown };

function record(v: unknown): Record<string, unknown> | null {
  return v != null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function norm(v: unknown): string {
  return String(v ?? "").trim().toLowerCase();
}

function centsFromZar(v: unknown): number | null {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

function classifyLine(label: string, matchedExtraSlug: string | null): Pick<BookingLineItemInsert, "item_type" | "slug"> {
  const n = norm(label);
  if (/service\s*fee|platform\s*fee|payment\s*fee/.test(n)) return { item_type: "adjustment", slug: "service-fee" };
  if (matchedExtraSlug) return { item_type: "extra", slug: matchedExtraSlug };
  if (/bathroom/.test(n)) return { item_type: "bathroom", slug: null };
  if (/bedroom|extra\s*room/.test(n)) return { item_type: "room", slug: /extra\s*room/.test(n) ? "extra-rooms" : null };
  if (/\(base\)|\bbase\b/.test(n)) return { item_type: "base", slug: null };
  return { item_type: "adjustment", slug: null };
}

export type HistoricalTeamLedgerInput = {
  bookingId: string;
  bookingSnapshot: unknown;
  totalPaidZar?: number | null;
  amountPaidCents?: number | null;
};

export type HistoricalTeamLedgerResult =
  | { ok: true; declaredPayableCents: number; sourceLineTotalCents: number; items: BookingLineItemInsert[] }
  | { ok: false; error: string };

/**
 * Reconstruct a historical TEAM booking's customer financial ledger from its immutable quote snapshot.
 * All lines are explicitly non-cleaner-earning because team payout source of truth is the roster /
 * team_job_member_payouts ledger, not booking_line_items.
 *
 * Fail closed: source lines must exist and sum exactly to the persisted prepaid payable.
 */
export function buildHistoricalTeamFinancialLedger(
  input: HistoricalTeamLedgerInput,
): HistoricalTeamLedgerResult {
  const exactPaid =
    typeof input.amountPaidCents === "number" && Number.isFinite(input.amountPaidCents)
      ? Math.max(0, Math.round(input.amountPaidCents))
      : null;
  const fromZar =
    typeof input.totalPaidZar === "number" && Number.isFinite(input.totalPaidZar)
      ? Math.max(0, Math.round(input.totalPaidZar * 100))
      : null;
  const declaredPayableCents =
    exactPaid != null && exactPaid > 0 ? exactPaid : fromZar != null && fromZar > 0 ? fromZar : exactPaid ?? fromZar ?? 0;
  if (declaredPayableCents <= 0) return { ok: false, error: "Positive prepaid payable is required." };

  const snap = record(input.bookingSnapshot);
  const pricing = record(snap?.pricingSummary);
  const rawLines = Array.isArray(pricing?.lineItems) ? (pricing?.lineItems as SnapshotLine[]) : [];
  if (rawLines.length === 0) return { ok: false, error: "Immutable pricingSummary.lineItems are required." };

  const rawExtras = Array.isArray(pricing?.selected_extras) ? (pricing?.selected_extras as SnapshotExtra[]) : [];
  const extras = rawExtras
    .map((e) => ({
      name: norm(e.name),
      priceCents: centsFromZar(e.price),
      slug: typeof e.extra_id === "string" && e.extra_id.trim() ? e.extra_id.trim() : null,
    }))
    .filter((e) => e.name && e.priceCents != null && e.slug);

  const items: BookingLineItemInsert[] = [];
  for (const [index, raw] of rawLines.entries()) {
    const label = typeof raw.label === "string" ? raw.label.trim() : "";
    const amountCents = centsFromZar(raw.amountZar);
    if (!label || amountCents == null) {
      return { ok: false, error: `Invalid immutable source line at index ${index}.` };
    }
    const matchedExtra =
      extras.find((e) => e.name === norm(label) && e.priceCents === amountCents) ??
      extras.find((e) => e.name === norm(label));
    const classified = classifyLine(label, matchedExtra?.slug ?? null);
    items.push({
      item_type: classified.item_type,
      slug: classified.slug,
      name: label,
      quantity: 1,
      unit_price_cents: amountCents,
      total_price_cents: amountCents,
      pricing_source: SOURCE,
      metadata: {
        source: "booking_snapshot.pricingSummary.lineItems",
        sourceLineIndex: index,
        historical_team_financial_ledger_only: true,
      },
      earns_cleaner: false,
    });
  }

  const sourceLineTotalCents = items.reduce((sum, item) => sum + item.total_price_cents, 0);
  if (sourceLineTotalCents !== declaredPayableCents) {
    return {
      ok: false,
      error: `Immutable source lines sum to ${sourceLineTotalCents} cents, expected ${declaredPayableCents}.`,
    };
  }

  return { ok: true, declaredPayableCents, sourceLineTotalCents, items };
}
