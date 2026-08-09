import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { createSalesDocument } from "@/lib/salesDocument/salesDocumentMutations";
import { parseSalesDocumentLineItems } from "@/lib/salesDocument/types";
import { SALES_DOCUMENT_ADMIN_COLUMNS } from "@/lib/salesDocument/salesDocumentColumns";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { summarizeSalesPipeline } from "@/lib/admin/sales/salesPipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");
  const status = searchParams.get("status");
  const q = (searchParams.get("q") ?? "").trim().toLowerCase();

  let query = admin.from("sales_documents").select(SALES_DOCUMENT_ADMIN_COLUMNS).order("created_at", { ascending: false });

  if (type === "quote" || type === "invoice") {
    query = query.eq("document_type", type);
  }
  if (status && status !== "all") {
    query = query.eq("status", status);
  }

  const { data, error } = await query.limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let rows = (data ?? []) as Record<string, unknown>[];

  const documentIds = rows.map((row) => String(row.id ?? "")).filter(Boolean);
  const bookingsByDocumentId = new Map<string, Record<string, unknown>>();
  for (let i = 0; i < documentIds.length; i += 100) {
    const { data: bookings, error: bookingError } = await admin
      .from("bookings")
      .select(
        "id,sales_document_id,status,payment_status,payment_completed_at,total_paid_zar,amount_paid_cents,refunded_at,refund_status,billing_type,is_monthly_billing_booking,monthly_invoice_id",
      )
      .in("sales_document_id", documentIds.slice(i, i + 100));
    if (bookingError) return NextResponse.json({ error: bookingError.message }, { status: 500 });
    for (const booking of (bookings ?? []) as Record<string, unknown>[]) {
      const salesDocumentId = String(booking.sales_document_id ?? "");
      if (salesDocumentId) bookingsByDocumentId.set(salesDocumentId, booking);
    }
  }

  rows = rows.map((row) => ({
    ...row,
    linked_booking: bookingsByDocumentId.get(String(row.id ?? "")) ?? null,
  }));
  const pipeline = summarizeSalesPipeline(rows as never[]);
  if (q) {
    rows = rows.filter((r) => {
      const name = String(r.customer_name ?? "").toLowerCase();
      const email = String(r.customer_email ?? "").toLowerCase();
      const id = String(r.id ?? "").toLowerCase();
      return name.includes(q) || email.includes(q) || id.includes(q);
    });
  }

  return NextResponse.json({ documents: rows, pipeline });
}

export async function POST(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const documentType = body.document_type === "invoice" ? "invoice" : body.document_type === "quote" ? "quote" : null;
  if (!documentType) return NextResponse.json({ error: "invalid_document_type" }, { status: 400 });

  const result = await createSalesDocument(admin, {
    document_type: documentType,
    customer_id: typeof body.customer_id === "string" ? body.customer_id : null,
    customer_name: String(body.customer_name ?? ""),
    customer_email: String(body.customer_email ?? ""),
    customer_phone: typeof body.customer_phone === "string" ? body.customer_phone : null,
    line_items: parseSalesDocumentLineItems(body.line_items),
    due_date: typeof body.due_date === "string" ? body.due_date : null,
    notes: typeof body.notes === "string" ? body.notes : null,
    created_by: auth.userId,
  });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true, id: result.id });
}
