import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { logSystemEvent } from "@/lib/logging/systemLog";

export type HistoricalQuoteBookingRecoveryRow = {
  quote_id: string;
  invoice_id: string;
  customer_name: string;
  invoice_status: string;
  invoice_total_cents: number;
  booking_id: string | null;
  booking_service: string | null;
  booking_date: string | null;
  booking_status: string | null;
  booking_payment_status: string | null;
  booking_amount_cents: number | null;
  classification:
    | "linkable"
    | "payment_state_conflict"
    | "amount_mismatch"
    | "multiple_candidates"
    | "no_candidate";
  reason: string;
};

type TargetRow = {
  quote_id: string;
  invoice_id: string;
  customer_id: string | null;
  customer_name: string;
  customer_email: string;
  quote_created_at: string;
  invoice_created_at: string;
  invoice_total_cents: number;
  invoice_status: string;
};

type BookingCandidate = {
  id: string;
  service: string | null;
  date: string | null;
  status: string | null;
  payment_status: string | null;
  amount_paid_cents: number | null;
  total_paid_zar: number | null;
  sales_document_id: string | null;
  customer_id: string | null;
  customer_email: string | null;
  created_at: string;
};

function bookingAmountCents(row: BookingCandidate): number {
  const direct = Math.max(0, Math.round(Number(row.amount_paid_cents ?? 0)));
  if (direct > 0) return direct;
  return Math.max(0, Math.round(Number(row.total_paid_zar ?? 0) * 100));
}

export async function auditHistoricalQuoteBookingRecovery(
  admin: SupabaseClient,
): Promise<HistoricalQuoteBookingRecoveryRow[]> {
  const { data: targets, error } = await admin
    .from("sales_documents")
    .select(
      "id, converted_from_id, customer_id, customer_name, customer_email, total_cents, status, created_at",
    )
    .eq("document_type", "invoice")
    .not("converted_from_id", "is", null);

  if (error) throw new Error(error.message);

  const rows: HistoricalQuoteBookingRecoveryRow[] = [];

  for (const invoice of targets ?? []) {
    const invoiceId = String(invoice.id);
    const quoteId = String(invoice.converted_from_id ?? "");
    if (!quoteId) continue;

    const { data: linkedBooking } = await admin
      .from("bookings")
      .select("id")
      .eq("sales_document_id", invoiceId)
      .limit(1)
      .maybeSingle();
    if (linkedBooking?.id) continue;

    const { data: quote } = await admin
      .from("sales_documents")
      .select("id, customer_id, customer_name, customer_email, created_at, status")
      .eq("id", quoteId)
      .eq("document_type", "quote")
      .maybeSingle();

    if (!quote || String(quote.status) !== "accepted") continue;

    const target: TargetRow = {
      quote_id: quoteId,
      invoice_id: invoiceId,
      customer_id: (quote.customer_id as string | null) ?? null,
      customer_name: String(quote.customer_name ?? ""),
      customer_email: String(quote.customer_email ?? ""),
      quote_created_at: String(quote.created_at),
      invoice_created_at: String(invoice.created_at),
      invoice_total_cents: Math.max(0, Math.round(Number(invoice.total_cents ?? 0))),
      invoice_status: String(invoice.status ?? ""),
    };

    const start = new Date(new Date(target.quote_created_at).getTime() - 7 * 86400000).toISOString();
    const end = new Date(new Date(target.invoice_created_at).getTime() + 30 * 86400000).toISOString();

    let query = admin
      .from("bookings")
      .select(
        "id, service, date, status, payment_status, amount_paid_cents, total_paid_zar, sales_document_id, customer_id, customer_email, created_at",
      )
      .is("sales_document_id", null)
      .gte("created_at", start)
      .lte("created_at", end)
      .order("created_at", { ascending: true });

    if (target.customer_id) {
      query = query.eq("customer_id", target.customer_id);
    } else {
      query = query.ilike("customer_email", target.customer_email);
    }

    const { data: candidateRows, error: candidateErr } = await query;
    if (candidateErr) throw new Error(candidateErr.message);

    const candidates = (candidateRows ?? []) as BookingCandidate[];

    if (candidates.length === 0) {
      rows.push({
        quote_id: target.quote_id,
        invoice_id: target.invoice_id,
        customer_name: target.customer_name,
        invoice_status: target.invoice_status,
        invoice_total_cents: target.invoice_total_cents,
        booking_id: null,
        booking_service: null,
        booking_date: null,
        booking_status: null,
        booking_payment_status: null,
        booking_amount_cents: null,
        classification: "no_candidate",
        reason: "No unlinked booking candidate found for this customer in the conversion window.",
      });
      continue;
    }

    const exactAmount = candidates.filter(
      (booking) => bookingAmountCents(booking) === target.invoice_total_cents,
    );

    if (exactAmount.length > 1) {
      rows.push({
        quote_id: target.quote_id,
        invoice_id: target.invoice_id,
        customer_name: target.customer_name,
        invoice_status: target.invoice_status,
        invoice_total_cents: target.invoice_total_cents,
        booking_id: null,
        booking_service: null,
        booking_date: null,
        booking_status: null,
        booking_payment_status: null,
        booking_amount_cents: null,
        classification: "multiple_candidates",
        reason: "More than one unlinked booking has the exact invoice amount.",
      });
      continue;
    }

    const candidate = exactAmount[0] ?? (candidates.length === 1 ? candidates[0] : null);
    if (!candidate) {
      rows.push({
        quote_id: target.quote_id,
        invoice_id: target.invoice_id,
        customer_name: target.customer_name,
        invoice_status: target.invoice_status,
        invoice_total_cents: target.invoice_total_cents,
        booking_id: null,
        booking_service: null,
        booking_date: null,
        booking_status: null,
        booking_payment_status: null,
        booking_amount_cents: null,
        classification: "multiple_candidates",
        reason: "Multiple customer bookings exist but none is a unique exact-amount match.",
      });
      continue;
    }

    const candidateAmount = bookingAmountCents(candidate);
    if (candidateAmount !== target.invoice_total_cents) {
      rows.push({
        quote_id: target.quote_id,
        invoice_id: target.invoice_id,
        customer_name: target.customer_name,
        invoice_status: target.invoice_status,
        invoice_total_cents: target.invoice_total_cents,
        booking_id: candidate.id,
        booking_service: candidate.service,
        booking_date: candidate.date,
        booking_status: candidate.status,
        booking_payment_status: candidate.payment_status,
        booking_amount_cents: candidateAmount,
        classification: "amount_mismatch",
        reason: "Candidate booking amount does not match the converted invoice total.",
      });
      continue;
    }

    const invoicePaid = target.invoice_status === "paid";
    const bookingPaid = String(candidate.payment_status ?? "").toLowerCase() === "success";
    if (invoicePaid !== bookingPaid) {
      rows.push({
        quote_id: target.quote_id,
        invoice_id: target.invoice_id,
        customer_name: target.customer_name,
        invoice_status: target.invoice_status,
        invoice_total_cents: target.invoice_total_cents,
        booking_id: candidate.id,
        booking_service: candidate.service,
        booking_date: candidate.date,
        booking_status: candidate.status,
        booking_payment_status: candidate.payment_status,
        booking_amount_cents: candidateAmount,
        classification: "payment_state_conflict",
        reason: "Invoice and candidate booking disagree on whether payment was completed.",
      });
      continue;
    }

    rows.push({
      quote_id: target.quote_id,
      invoice_id: target.invoice_id,
      customer_name: target.customer_name,
      invoice_status: target.invoice_status,
      invoice_total_cents: target.invoice_total_cents,
      booking_id: candidate.id,
      booking_service: candidate.service,
      booking_date: candidate.date,
      booking_status: candidate.status,
      booking_payment_status: candidate.payment_status,
      booking_amount_cents: candidateAmount,
      classification: "linkable",
      reason: "Unique customer booking with exact amount and consistent payment state.",
    });
  }

  return rows;
}

export async function linkHistoricalQuoteBooking(
  admin: SupabaseClient,
  params: { invoiceId: string; bookingId: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const audit = await auditHistoricalQuoteBookingRecovery(admin);
  const row = audit.find(
    (item) =>
      item.invoice_id === params.invoiceId &&
      item.booking_id === params.bookingId &&
      item.classification === "linkable",
  );
  if (!row) return { ok: false, error: "recovery_pair_not_linkable_or_changed" };

  const { data: booking } = await admin
    .from("bookings")
    .select("id, sales_document_id")
    .eq("id", params.bookingId)
    .maybeSingle();
  if (!booking) return { ok: false, error: "booking_not_found" };
  if (String(booking.sales_document_id ?? "").trim()) {
    return { ok: false, error: "booking_already_linked" };
  }

  const { error } = await admin
    .from("bookings")
    .update({ sales_document_id: params.invoiceId, updated_at: new Date().toISOString() })
    .eq("id", params.bookingId)
    .is("sales_document_id", null);

  if (error) return { ok: false, error: error.message };

  await logSystemEvent({
    level: "info",
    source: "sales_document/historical_booking_recovery",
    message: "existing_booking_linked_to_sales_invoice",
    context: {
      invoice_id: params.invoiceId,
      quote_id: row.quote_id,
      booking_id: params.bookingId,
      customer_name: row.customer_name,
      invoice_total_cents: row.invoice_total_cents,
      financial_state_changed: false,
    },
  });

  return { ok: true };
}
