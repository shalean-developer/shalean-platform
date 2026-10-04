import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createCustomerCareCase } from "@/lib/customerCare/customerCareCases";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const url = new URL(request.url);
  const status = url.searchParams.get("status")?.trim();
  const assignedTo = url.searchParams.get("assigned_to")?.trim();
  let query = admin
    .from("customer_care_cases")
    .select("*")
    .order("resolution_due_at", { ascending: true })
    .limit(200);
  if (status) query = query.eq("status", status);
  if (assignedTo) query = query.eq("assigned_to", assignedTo);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ cases: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  const subject = String(body.subject ?? "").trim();
  const description = String(body.description ?? "").trim();
  const category = String(body.category ?? "").trim();
  if (subject.length < 3 || description.length < 3 || !category) {
    return NextResponse.json({ error: "subject, description and category are required." }, { status: 400 });
  }

  const result = await createCustomerCareCase(admin, {
    bookingId: typeof body.bookingId === "string" ? body.bookingId : null,
    customerId: typeof body.customerId === "string" ? body.customerId : null,
    customerEmail: typeof body.customerEmail === "string" ? body.customerEmail : null,
    customerPhone: typeof body.customerPhone === "string" ? body.customerPhone : null,
    category,
    priority: ["low", "normal", "high", "critical"].includes(String(body.priority))
      ? (String(body.priority) as "low" | "normal" | "high" | "critical")
      : "normal",
    subject,
    description,
    assignedTo: typeof body.assignedTo === "string" ? body.assignedTo : null,
    createdBy: auth.userId,
    evidence: Array.isArray(body.evidence) ? body.evidence : [],
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 });
  return NextResponse.json({ case: result.case }, { status: 201 });
}
