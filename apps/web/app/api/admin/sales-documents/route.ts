import { NextResponse } from "next/server";

import { requireAnyAdminPermissionFromRequest } from "@/lib/admin/requirePermission";
import { createSalesDocument } from "@/lib/salesDocument/salesDocumentMutations";
import { parseSalesDocumentLineItems } from "@/lib/salesDocument/types";
import { SALES_DOCUMENT_ADMIN_COLUMNS } from "@/lib/salesDocument/salesDocumentColumns";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { salesPipelineSource, salesPipelineStage, summarizeSalesPipeline, type SalesPipelineDocument } from "@/lib/admin/sales/salesPipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAnyAdminPermissionFromRequest(request, ["invoice.manage", "customer.contact", "marketing.view"]);
  if (!auth.ok) return auth.response;

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");
  const status = searchParams.get("status");
  const q = (searchParams.get("q") ?? "").trim().toLowerCase();

  const rows: Record<string, unknown>[] = [];
  const pageSize = 1000;
  for (let fromIndex = 0; ; fromIndex += pageSize) {
    let query = admin
      .from("sales_documents")
      .select(SALES_DOCUMENT_ADMIN_COLUMNS)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false });
    if (type === "quote" || type === "invoice") query = query.eq("document_type", type);
    if (status && status !== "all") query = query.eq("status", status);

    const { data, error } = await query.range(fromIndex, fromIndex + pageSize - 1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    rows.push(...((data ?? []) as Record<string, unknown>[]));
    if ((data?.length ?? 0) < pageSize) break;
  }

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

  const documentsById = new Map(rows.map((row) => [String(row.id ?? ""), row]));
  const pipelineRows: Array<Record<string, unknown> & { linked_booking: Record<string, unknown> | null; pipeline_stage: string; pipeline_source: string }> = rows.map((row) => {
    const enriched = {
      ...row,
      linked_booking: bookingsByDocumentId.get(String(row.id ?? "")) ?? null,
    };
    const parent = documentsById.get(String(row.converted_from_id ?? "")) ?? null;
    return {
      ...enriched,
      pipeline_stage: salesPipelineStage(enriched as unknown as SalesPipelineDocument),
      pipeline_source: salesPipelineSource(enriched as SalesPipelineDocument, parent as SalesPipelineDocument | null),
    };
  });
  const pipeline = summarizeSalesPipeline(pipelineRows as never[]);
  const now = Date.now();
  const rootRows = pipelineRows.filter((row) => !row.converted_from_id);
  const sources = new Map<string, { opportunities: number; won: number }>();
  let overdueFollowUps = 0;
  let responseHours = 0;
  let responseCount = 0;
  for (const row of rootRows) {
    const source = String(row.lead_source ?? row.pipeline_source ?? "unknown");
    const sourceRow = sources.get(source) ?? { opportunities: 0, won: 0 };
    sourceRow.opportunities += 1;
    if (row.pipeline_stage === "won") sourceRow.won += 1;
    sources.set(source, sourceRow);
    const followUpAt = Date.parse(String(row.crm_next_follow_up_at ?? ""));
    if (Number.isFinite(followUpAt) && followUpAt < now && !["won", "lost"].includes(row.pipeline_stage)) overdueFollowUps += 1;
    const createdAt = Date.parse(String(row.created_at ?? ""));
    const respondedAt = Date.parse(String(row.crm_first_responded_at ?? ""));
    if (Number.isFinite(createdAt) && Number.isFinite(respondedAt) && respondedAt >= createdAt) {
      responseHours += (respondedAt - createdAt) / 3_600_000;
      responseCount += 1;
    }
  }
  const reporting = {
    overdue_follow_ups: overdueFollowUps,
    average_response_hours: responseCount ? Math.round((responseHours / responseCount) * 10) / 10 : null,
    win_rate_percent: rootRows.length ? Math.round((pipeline.counts.won / rootRows.length) * 1000) / 10 : 0,
    sources: Array.from(sources, ([source, values]) => ({ source, ...values })).sort((a, b) => b.opportunities - a.opportunities),
  };
  let visibleRows = pipelineRows;
  if (q) {
    visibleRows = visibleRows.filter((r) => {
      const name = String(r.customer_name ?? "").toLowerCase();
      const email = String(r.customer_email ?? "").toLowerCase();
      const id = String(r.id ?? "").toLowerCase();
      return name.includes(q) || email.includes(q) || id.includes(q);
    });
  }

  return NextResponse.json({ documents: visibleRows, pipeline, reporting });
}

export async function POST(request: Request) {
  const auth = await requireAnyAdminPermissionFromRequest(request, ["invoice.manage"]);
  if (!auth.ok) return auth.response;

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
    created_by: auth.user.id,
  });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true, id: result.id });
}
