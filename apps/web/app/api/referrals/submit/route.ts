import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { referralFormSchema, submitReferralForm } from "@/lib/referrals/submitReferralForm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const parsed = referralFormSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return NextResponse.json(
      { error: first?.message ?? "Invalid form data.", field: first?.path[0] },
      { status: 400 },
    );
  }

  const result = await submitReferralForm(admin, parsed.data);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, field: result.field },
      { status: result.field ? 400 : 503 },
    );
  }

  return NextResponse.json({ success: true, submissionId: result.submissionId });
}
