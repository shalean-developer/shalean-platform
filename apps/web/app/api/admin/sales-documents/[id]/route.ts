import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { updateSalesDocumentDraft } from "@/lib/salesDocument/salesDocumentMutations";
import { parseSalesDocumentLineItems } from "@/lib/salesDocument/types";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PUBLIC_COLUMNS =
  "id, document_type, status, source, customer_id, customer_name, customer_email, customer_phone, line_items, subtotal_cents, total_cents, balance_cents, amount_paid_cents, currency, due_date, notes, request_details, sent_at, converted_from_id, public_token, paystack_reference, created_at, updated_at";

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi(_request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await ctx.params;
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const { data, error } = await admin.from("sales_documents").select(PUBLIC_COLUMNS).eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "not_found" }, { status: 404 });

  return NextResponse.json({ document: data });
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await ctx.params;
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const result = await updateSalesDocumentDraft(admin, id, {
    customer_name: typeof body.customer_name === "string" ? body.customer_name : undefined,
    customer_email: typeof body.customer_email === "string" ? body.customer_email : undefined,
    customer_phone: typeof body.customer_phone === "string" ? body.customer_phone : body.customer_phone === null ? null : undefined,
    customer_id: typeof body.customer_id === "string" ? body.customer_id : body.customer_id === null ? null : undefined,
    due_date: typeof body.due_date === "string" ? body.due_date : body.due_date === null ? null : undefined,
    notes: typeof body.notes === "string" ? body.notes : body.notes === null ? null : undefined,
    line_items: body.line_items !== undefined ? parseSalesDocumentLineItems(body.line_items) : undefined,
  });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
