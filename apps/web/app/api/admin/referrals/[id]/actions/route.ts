import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  creditCleaningCredit,
  reverseCleaningCredit,
} from "@/lib/referrals/credits";
import { processCustomerReferralAfterFirstPaidBooking } from "@/lib/referrals/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ActionBody = {
  action: "approve" | "reject" | "issue_credit" | "reverse_credit" | "add_note";
  note?: string;
  amountZar?: number;
};

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const { id } = await context.params;
  let body: ActionBody;
  try {
    body = (await request.json()) as ActionBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const adminEmail = auth.email ?? "admin";

  const { data: referral, error: fetchErr } = await admin
    .from("referrals")
    .select("id, referrer_id, referrer_type, status, reward_amount, referred_email_or_phone, admin_notes")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr || !referral) {
    return NextResponse.json({ error: "Referral not found." }, { status: 404 });
  }

  const row = referral as {
    id: string;
    referrer_id: string;
    referrer_type: string;
    status: string;
    reward_amount: number;
    referred_email_or_phone: string;
    admin_notes: string | null;
  };

  switch (body.action) {
    case "add_note": {
      const notes = [row.admin_notes, body.note?.trim()].filter(Boolean).join("\n");
      await admin.from("referrals").update({ admin_notes: notes }).eq("id", id);
      return NextResponse.json({ success: true });
    }
    case "approve": {
      if (row.status !== "pending") {
        return NextResponse.json({ error: "Only pending referrals can be approved." }, { status: 400 });
      }
      await admin.from("referrals").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", id);
      return NextResponse.json({ success: true });
    }
    case "reject": {
      await admin
        .from("referrals")
        .update({
          status: "cancelled",
          rejected_at: new Date().toISOString(),
          rejected_by: adminEmail,
          admin_notes: [row.admin_notes, body.note?.trim()].filter(Boolean).join("\n") || null,
        })
        .eq("id", id);
      return NextResponse.json({ success: true });
    }
    case "issue_credit": {
      if (row.referrer_type !== "customer") {
        return NextResponse.json({ error: "Credit can only be issued to customer referrers." }, { status: 400 });
      }
      const amount = Math.round(body.amountZar ?? row.reward_amount ?? 50);
      const result = await creditCleaningCredit({
        admin,
        userId: row.referrer_id,
        amountZar: amount,
        referralId: id,
        note: body.note ?? "Manual credit issue by admin",
        createdBy: adminEmail,
      });
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 });
      await admin
        .from("referrals")
        .update({ status: "rewarded", rewarded_at: new Date().toISOString() })
        .eq("id", id);
      return NextResponse.json({ success: true, balanceAfter: result.balanceAfter });
    }
    case "reverse_credit": {
      const amount = Math.round(body.amountZar ?? row.reward_amount ?? 50);
      const result = await reverseCleaningCredit({
        admin,
        userId: row.referrer_id,
        amountZar: amount,
        referralId: id,
        note: body.note ?? "Credit reversed by admin",
        createdBy: adminEmail,
      });
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 });
      return NextResponse.json({ success: true, balanceAfter: result.balanceAfter });
    }
    default:
      return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }
}
