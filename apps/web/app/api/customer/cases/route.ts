import { NextResponse } from "next/server";

import { authenticateCustomerBookingRequest } from "@/lib/customer/customerBookingModifyHandlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PublicCase = {
  id: string;
  case_number: number;
  booking_id: string | null;
  category: string;
  priority: string;
  status: string;
  subject: string;
  first_response_due_at: string;
  resolution_due_at: string;
  first_responded_at: string | null;
  resolved_at: string | null;
  closed_at: string | null;
  resolution_summary: string | null;
  created_at: string;
  updated_at: string;
};

const PUBLIC_FIELDS = "id,case_number,booking_id,category,priority,status,subject,first_response_due_at,resolution_due_at,first_responded_at,resolved_at,closed_at,resolution_summary,created_at,updated_at";

export async function GET(request: Request) {
  const auth = await authenticateCustomerBookingRequest(request);
  if (!auth.ok) return auth.response;

  const merged = new Map<string, PublicCase>();
  const { data: crm, error: crmError } = await auth.admin
    .from("customers")
    .select("id")
    .eq("auth_user_id", auth.userId)
    .eq("status", "active")
    .maybeSingle();
  if (crmError) return NextResponse.json({ error: crmError.message }, { status: 500 });

  if (crm?.id) {
    const byCrm = await auth.admin
      .from("customer_care_cases")
      .select(PUBLIC_FIELDS)
      .eq("crm_customer_id", crm.id)
      .order("created_at", { ascending: false })
      .limit(100);
    if (byCrm.error) return NextResponse.json({ error: byCrm.error.message }, { status: 500 });
    for (const row of (byCrm.data ?? []) as PublicCase[]) merged.set(row.id, row);
  }

  // Legacy compatibility while older cases finish converging to the CRM key.
  const byLegacyId = await auth.admin
    .from("customer_care_cases")
    .select(PUBLIC_FIELDS)
    .eq("customer_id", auth.userId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (byLegacyId.error) return NextResponse.json({ error: byLegacyId.error.message }, { status: 500 });
  for (const row of (byLegacyId.data ?? []) as PublicCase[]) merged.set(row.id, row);

  const email = auth.viewerEmail?.trim().toLowerCase() ?? "";
  if (email) {
    const byEmail = await auth.admin
      .from("customer_care_cases")
      .select(PUBLIC_FIELDS)
      .eq("customer_email", email)
      .order("created_at", { ascending: false })
      .limit(100);
    if (byEmail.error) return NextResponse.json({ error: byEmail.error.message }, { status: 500 });
    for (const row of (byEmail.data ?? []) as PublicCase[]) merged.set(row.id, row);
  }

  const cases = [...merged.values()].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  return NextResponse.json({ cases });
}
