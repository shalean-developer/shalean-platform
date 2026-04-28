import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type MonthlyInvoiceSnapshotV1 = {
  version: 1;
  frozen_at: string;
  invoice_id: string;
  customer_id: string;
  month: string;
  totals: {
    total_amount_cents: number;
    amount_paid_cents: number;
    total_bookings: number;
  };
  bookings: Array<{
    id: string;
    date: string | null;
    time: string | null;
    status: string | null;
    total_paid_zar: number | null;
    amount_paid_cents: number | null;
    payment_status: string | null;
    service: string | null;
  }>;
  adjustments: Array<{
    id: string;
    amount_cents: number;
    reason: string;
    applied_to_invoice_id: string | null;
  }>;
};

/** Rolling `snapshot_current` wrapper; `snapshot_version` starts at 1 on finalize. */
export function wrapSnapshotCurrentV1(atFinalize: MonthlyInvoiceSnapshotV1): Record<string, unknown> {
  const total = atFinalize.totals.total_amount_cents;
  const paid = atFinalize.totals.amount_paid_cents;
  return {
    schema: "monthly_invoice_snapshot_current_v1",
    at_finalize: atFinalize,
    events: [],
    adjustments_applied_after_send: [],
    last_totals: {
      total_amount_cents: total,
      amount_paid_cents: paid,
      balance_cents: Math.max(0, total - paid),
    },
  };
}

export async function buildMonthlyInvoiceSnapshot(
  admin: SupabaseClient,
  invoiceId: string,
): Promise<MonthlyInvoiceSnapshotV1 | null> {
  const { data: inv, error: invErr } = await admin
    .from("monthly_invoices")
    .select("id, customer_id, month, total_amount_cents, amount_paid_cents, total_bookings")
    .eq("id", invoiceId)
    .maybeSingle();

  if (invErr || !inv) return null;

  const head = inv as {
    id: string;
    customer_id: string;
    month: string;
    total_amount_cents: number | null;
    amount_paid_cents: number | null;
    total_bookings: number | null;
  };

  const { data: bookings, error: bErr } = await admin
    .from("bookings")
    .select("id, date, time, status, total_paid_zar, amount_paid_cents, payment_status, service")
    .eq("monthly_invoice_id", invoiceId)
    .order("date", { ascending: true });

  if (bErr) return null;

  const { data: adj, error: aErr } = await admin
    .from("invoice_adjustments")
    .select("id, amount_cents, reason, applied_to_invoice_id")
    .eq("customer_id", head.customer_id)
    .eq("month_applied", head.month);

  if (aErr) return null;

  return {
    version: 1,
    frozen_at: new Date().toISOString(),
    invoice_id: head.id,
    customer_id: head.customer_id,
    month: head.month,
    totals: {
      total_amount_cents: Math.round(Number(head.total_amount_cents ?? 0)),
      amount_paid_cents: Math.round(Number(head.amount_paid_cents ?? 0)),
      total_bookings: Math.round(Number(head.total_bookings ?? 0)),
    },
    bookings: (bookings ?? []).map((r) => {
      const x = r as Record<string, unknown>;
      return {
        id: String(x.id ?? ""),
        date: (x.date as string | null) ?? null,
        time: (x.time as string | null) ?? null,
        status: (x.status as string | null) ?? null,
        total_paid_zar: x.total_paid_zar != null ? Number(x.total_paid_zar) : null,
        amount_paid_cents: x.amount_paid_cents != null ? Number(x.amount_paid_cents) : null,
        payment_status: (x.payment_status as string | null) ?? null,
        service: (x.service as string | null) ?? null,
      };
    }),
    adjustments: (adj ?? []).map((r) => {
      const x = r as Record<string, unknown>;
      return {
        id: String(x.id ?? ""),
        amount_cents: Math.round(Number(x.amount_cents ?? 0)),
        reason: String(x.reason ?? ""),
        applied_to_invoice_id: x.applied_to_invoice_id != null ? String(x.applied_to_invoice_id) : null,
      };
    }),
  };
}
