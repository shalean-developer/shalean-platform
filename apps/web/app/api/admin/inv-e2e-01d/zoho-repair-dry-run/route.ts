import { NextResponse } from "next/server";

import { requireAdminPermissionFromRequest } from "@/lib/admin/requirePermission";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BOOKING_TARGETS = [
  ["1e2f0c30-5cba-4e0b-8fec-f744c6cb471d", 200600],
  ["a2a7fa62-04aa-42dc-a557-a1da8843641b", 29300],
  ["d5efd3a4-3e1c-487a-b16a-3ed484ea0787", 39000],
  ["eceab240-6032-452d-9d5b-c755261ffc24", 42900],
  ["8508b9dc-cd91-4aaa-bc13-daab069c6c2a", 58000],
  ["2b3d5f7b-bed5-4d0f-b865-6fc163db831a", 40000],
  ["8b59fe07-0a22-4ba0-8239-92607b96db90", 46700],
  ["d860554e-c132-477b-bf15-557fb9c88a5e", 242000],
] as const;

const MONTHLY_INVOICE_ID = "81acdbc8-ddf4-4fc3-add4-0daf408740ca";
const MONTHLY_AMOUNT_CENTS = 155200;
const SALES_DOCUMENT_ID = "f8e6fbfd-6495-454d-ac9b-20c82643f4db";
const SALES_DOCUMENT_AMOUNT_CENTS = 32000;

type Check = {
  kind: "booking" | "monthly_invoice" | "sales_document";
  id: string;
  expected_amount_cents: number;
  payment_transaction_id: string | null;
  queue_record_id: string | null;
  current_zoho_invoice_id: string | null;
  current_zoho_invoice_number: string | null;
  action: "create_and_pay" | "already_linked_review" | "blocked";
  ok: boolean;
  issues: string[];
};

async function paymentAndQueue(
  admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  entityType: Check["kind"],
  entityId: string,
  expectedAmountCents: number,
) {
  const issues: string[] = [];
  const { data: payments, error: paymentError } = await admin
    .from("payment_transactions")
    .select("id, amount_cents, gateway_reference, paid_at, sync_status, external_accounting_id")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId);

  if (paymentError) issues.push(`payment_lookup_failed:${paymentError.message}`);
  if (!payments || payments.length !== 1) {
    issues.push(`payment_transaction_count:${payments?.length ?? 0}`);
    return { issues, payment: null, queue: null };
  }

  const payment = payments[0];
  if (Number(payment.amount_cents) !== expectedAmountCents) {
    issues.push(`payment_amount_mismatch:${payment.amount_cents}`);
  }

  const { data: queues, error: queueError } = await admin
    .from("accounting_sync_records")
    .select("id, sync_status, retry_count, sync_errors, external_accounting_id")
    .eq("entity_type", "payment_transaction")
    .eq("entity_id", payment.id);

  if (queueError) issues.push(`queue_lookup_failed:${queueError.message}`);
  if (!queues || queues.length !== 1) {
    issues.push(`queue_record_count:${queues?.length ?? 0}`);
    return { issues, payment, queue: null };
  }

  return { issues, payment, queue: queues[0] };
}

async function checkBooking(
  admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  id: string,
  expectedAmountCents: number,
): Promise<Check> {
  const issues: string[] = [];
  const { data, error } = await admin
    .from("bookings")
    .select(
      "id, amount_paid_cents, total_paid_zar, payment_completed_at, payment_status, is_monthly_billing_booking, sales_document_id, payment_method, is_test, customer_email, zoho_invoice_id, zoho_invoice_number",
    )
    .eq("id", id)
    .maybeSingle();

  if (error) issues.push(`booking_lookup_failed:${error.message}`);
  if (!data) {
    return {
      kind: "booking",
      id,
      expected_amount_cents: expectedAmountCents,
      payment_transaction_id: null,
      queue_record_id: null,
      current_zoho_invoice_id: null,
      current_zoho_invoice_number: null,
      action: "blocked",
      ok: false,
      issues: [...issues, "booking_not_found"],
    };
  }

  if (data.is_test === true) issues.push("is_test");
  if (data.is_monthly_billing_booking === true) issues.push("monthly_billing_booking");
  if (String(data.sales_document_id ?? "").trim()) issues.push("sales_document_owned");
  if (String(data.payment_method ?? "").toLowerCase() === "zoho") issues.push("payment_method_zoho");
  if (!data.payment_completed_at) issues.push("payment_completed_at_missing");
  if (!String(data.customer_email ?? "").trim()) issues.push("customer_email_missing");

  const localAmount = Number(data.amount_paid_cents ?? 0) > 0
    ? Number(data.amount_paid_cents)
    : Math.round(Number(data.total_paid_zar ?? 0) * 100);
  if (localAmount !== expectedAmountCents) issues.push(`booking_amount_mismatch:${localAmount}`);

  const pq = await paymentAndQueue(admin, "booking", id, expectedAmountCents);
  issues.push(...pq.issues);

  const linked = String(data.zoho_invoice_id ?? "").trim();
  return {
    kind: "booking",
    id,
    expected_amount_cents: expectedAmountCents,
    payment_transaction_id: pq.payment?.id ?? null,
    queue_record_id: pq.queue?.id ?? null,
    current_zoho_invoice_id: linked || null,
    current_zoho_invoice_number: String(data.zoho_invoice_number ?? "").trim() || null,
    action: issues.length > 0 ? "blocked" : linked ? "already_linked_review" : "create_and_pay",
    ok: issues.length === 0,
    issues,
  };
}

async function checkMonthly(
  admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
): Promise<Check> {
  const issues: string[] = [];
  const { data, error } = await admin
    .from("monthly_invoices")
    .select("id, status, total_amount_cents, amount_paid_cents, zoho_invoice_id, zoho_invoice_number")
    .eq("id", MONTHLY_INVOICE_ID)
    .maybeSingle();

  if (error) issues.push(`monthly_lookup_failed:${error.message}`);
  if (!data) {
    return {
      kind: "monthly_invoice", id: MONTHLY_INVOICE_ID, expected_amount_cents: MONTHLY_AMOUNT_CENTS,
      payment_transaction_id: null, queue_record_id: null, current_zoho_invoice_id: null,
      current_zoho_invoice_number: null, action: "blocked", ok: false,
      issues: [...issues, "monthly_invoice_not_found"],
    };
  }

  if (String(data.status).toLowerCase() !== "paid") issues.push(`monthly_status:${data.status}`);
  if (Number(data.total_amount_cents) !== MONTHLY_AMOUNT_CENTS) issues.push(`monthly_total_mismatch:${data.total_amount_cents}`);
  if (Number(data.amount_paid_cents) !== MONTHLY_AMOUNT_CENTS) issues.push(`monthly_paid_mismatch:${data.amount_paid_cents}`);

  const pq = await paymentAndQueue(admin, "monthly_invoice", MONTHLY_INVOICE_ID, MONTHLY_AMOUNT_CENTS);
  issues.push(...pq.issues);
  const linked = String(data.zoho_invoice_id ?? "").trim();

  return {
    kind: "monthly_invoice",
    id: MONTHLY_INVOICE_ID,
    expected_amount_cents: MONTHLY_AMOUNT_CENTS,
    payment_transaction_id: pq.payment?.id ?? null,
    queue_record_id: pq.queue?.id ?? null,
    current_zoho_invoice_id: linked || null,
    current_zoho_invoice_number: String(data.zoho_invoice_number ?? "").trim() || null,
    action: issues.length > 0 ? "blocked" : linked ? "already_linked_review" : "create_and_pay",
    ok: issues.length === 0,
    issues,
  };
}

async function checkSales(
  admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
): Promise<Check> {
  const issues: string[] = [];
  const { data, error } = await admin
    .from("sales_documents")
    .select("id, document_type, status, total_cents, amount_paid_cents, zoho_invoice_id, zoho_invoice_number")
    .eq("id", SALES_DOCUMENT_ID)
    .maybeSingle();

  if (error) issues.push(`sales_lookup_failed:${error.message}`);
  if (!data) {
    return {
      kind: "sales_document", id: SALES_DOCUMENT_ID, expected_amount_cents: SALES_DOCUMENT_AMOUNT_CENTS,
      payment_transaction_id: null, queue_record_id: null, current_zoho_invoice_id: null,
      current_zoho_invoice_number: null, action: "blocked", ok: false,
      issues: [...issues, "sales_document_not_found"],
    };
  }

  if (data.document_type !== "invoice") issues.push(`sales_document_type:${data.document_type}`);
  if (String(data.status).toLowerCase() !== "paid") issues.push(`sales_status:${data.status}`);
  if (Number(data.total_cents) !== SALES_DOCUMENT_AMOUNT_CENTS) issues.push(`sales_total_mismatch:${data.total_cents}`);
  if (Number(data.amount_paid_cents) !== SALES_DOCUMENT_AMOUNT_CENTS) issues.push(`sales_paid_mismatch:${data.amount_paid_cents}`);

  const pq = await paymentAndQueue(admin, "sales_document", SALES_DOCUMENT_ID, SALES_DOCUMENT_AMOUNT_CENTS);
  issues.push(...pq.issues);
  const linked = String(data.zoho_invoice_id ?? "").trim();

  return {
    kind: "sales_document",
    id: SALES_DOCUMENT_ID,
    expected_amount_cents: SALES_DOCUMENT_AMOUNT_CENTS,
    payment_transaction_id: pq.payment?.id ?? null,
    queue_record_id: pq.queue?.id ?? null,
    current_zoho_invoice_id: linked || null,
    current_zoho_invoice_number: String(data.zoho_invoice_number ?? "").trim() || null,
    action: issues.length > 0 ? "blocked" : linked ? "already_linked_review" : "create_and_pay",
    ok: issues.length === 0,
    issues,
  };
}

export async function GET(request: Request) {
  const auth = await requireAdminPermissionFromRequest(request, "integration.manage");
  if (!auth.ok) return auth.response;

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const organizationId = String(process.env.ZOHO_ORGANIZATION_ID ?? "").trim();
  const checks: Check[] = [];
  for (const [id, amount] of BOOKING_TARGETS) checks.push(await checkBooking(admin, id, amount));
  checks.push(await checkMonthly(admin));
  checks.push(await checkSales(admin));

  const blocked = checks.filter((x) => !x.ok);
  return NextResponse.json({
    ok: blocked.length === 0,
    mode: "dry-run",
    writes_performed: false,
    allowlist_count: checks.length,
    zoho_organization_id_masked: organizationId ? `••••${organizationId.slice(-4)}` : null,
    expected_zoho_organization_suffix: "0285",
    correct_zoho_organization: organizationId === "927500285",
    blocked_count: blocked.length,
    create_and_pay_count: checks.filter((x) => x.action === "create_and_pay").length,
    already_linked_review_count: checks.filter((x) => x.action === "already_linked_review").length,
    checks,
  });
}
