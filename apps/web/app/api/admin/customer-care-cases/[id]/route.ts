import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { updateCustomerCareCase } from "@/lib/customerCare/customerCareCases";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const { id } = await ctx.params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  const statusRaw = typeof body.status === "string" ? body.status : undefined;
  const allowedStatuses = ["open", "investigating", "waiting_customer", "waiting_internal", "resolved", "closed"];
  if (statusRaw && !allowedStatuses.includes(statusRaw)) {
    return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  }
  if ((statusRaw === "resolved" || statusRaw === "closed") && !String(body.resolutionSummary ?? "").trim()) {
    return NextResponse.json({ error: "resolutionSummary is required to resolve or close a case." }, { status: 400 });
  }

  const result = await updateCustomerCareCase(admin, {
    caseId: id,
    actorUserId: auth.userId,
    status: statusRaw as "open" | "investigating" | "waiting_customer" | "waiting_internal" | "resolved" | "closed" | undefined,
    assignedTo: body.assignedTo === null ? null : typeof body.assignedTo === "string" ? body.assignedTo : undefined,
    note: typeof body.note === "string" ? body.note : undefined,
    resolutionSummary: typeof body.resolutionSummary === "string" ? body.resolutionSummary : undefined,
    refundAccountingId: body.refundAccountingId === null ? null : typeof body.refundAccountingId === "string" ? body.refundAccountingId : undefined,
    creditAmountCents: typeof body.creditAmountCents === "number" ? Math.max(0, Math.round(body.creditAmountCents)) : undefined,
    evidence: Array.isArray(body.evidence) ? body.evidence : undefined,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.error === "case_not_found" ? 404 : 500 });
  return NextResponse.json({ case: result.case });
}
