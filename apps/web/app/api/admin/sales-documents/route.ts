import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { createSalesDocument } from "@/lib/salesDocument/salesDocumentMutations";
import { parseSalesDocumentLineItems } from "@/lib/salesDocument/types";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PUBLIC_COLUMNS =
  "id, document_type, status, source, customer_id, customer_name, customer_email, customer_phone, line_items, subtotal_cents, total_cents, balance_cents, amount_paid_cents, currency, due_date, notes, request_details, sent_at, converted_from_id, public_token, paystack_reference, created_at, updated_at";

export async function GET(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");
  const status = searchParams.get("status");
  const q = (searchParams.get("q") ?? "").trim().toLowerCase();

  let query = admin.from("sales_documents").select(PUBLIC_COLUMNS).order("created_at", { ascending: false });

  if (type === "quote" || type === "invoice") {
    query = query.eq("document_type", type);
  }
  if (status && status !== "all") {
    query = query.eq("status", status);
  }

  const { data, error } = await query.limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let rows = (data ?? []) as Record<string, unknown>[];
  if (q) {
    rows = rows.filter((r) => {
      const name = String(r.customer_name ?? "").toLowerCase();
      const email = String(r.customer_email ?? "").toLowerCase();
      const id = String(r.id ?? "").toLowerCase();
      return name.includes(q) || email.includes(q) || id.includes(q);
    });
  }

  return NextResponse.json({ documents: rows });
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
