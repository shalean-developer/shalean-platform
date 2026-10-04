import { NextResponse } from "next/server";

import { requireAdminPermissionFromRequest } from "@/lib/admin/requirePermission";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { runInvE2e01dTargetedRepair } from "@/lib/accounting/invE2e01dTargetedRepair";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CONFIRMATION = "APPLY_INV_E2E_01D_10";
const EXPECTED_PROD_SUPABASE_REF = "paqjwfulwywtsyyvdxrq";
const EXPECTED_ZOHO_ORG = "927500285";

export async function POST(request: Request) {
  const auth = await requireAdminPermissionFromRequest(request, "integration.manage");
  if (!auth.ok) return auth.response;

  let body: { confirmation?: string };
  try {
    body = (await request.json()) as { confirmation?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  if (body.confirmation !== CONFIRMATION) {
    return NextResponse.json({ error: "Explicit repair confirmation required." }, { status: 400 });
  }

  const appEnv = String(process.env.SHALEAN_APP_ENV ?? "").trim().toLowerCase();
  if (appEnv !== "production") {
    return NextResponse.json({ error: "Targeted repair is production-only." }, { status: 409 });
  }

  const supabaseUrl = String(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
  if (!supabaseUrl.includes(EXPECTED_PROD_SUPABASE_REF)) {
    return NextResponse.json({ error: "Production Supabase guard failed." }, { status: 409 });
  }

  if (String(process.env.ZOHO_ORGANIZATION_ID ?? "").trim() !== EXPECTED_ZOHO_ORG) {
    return NextResponse.json({ error: "Zoho organization guard failed." }, { status: 409 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const result = await runInvE2e01dTargetedRepair(admin);

  return NextResponse.json(
    {
      ...result,
      confirmation: CONFIRMATION,
      writes_performed: true,
      scope: "8 bookings + 1 monthly invoice + 1 sales document",
    },
    { status: result.ok ? 200 : 207 },
  );
}
