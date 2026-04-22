import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth/admin";
import { createCleaner } from "@/lib/cleaner/createCleaner";
import { sendCleanerApprovedWhatsApp, sendCleanerOnboardingWhatsApp } from "@/lib/dispatch/offerNotifications";
import { linkCleanerReferralOnApproval } from "@/lib/referrals/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "Missing application id." }, { status: 400 });

  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!token) return NextResponse.json({ error: "Missing authorization." }, { status: 401 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  const pub = createClient(url, anon);
  const {
    data: { user },
  } = await pub.auth.getUser(token);
  if (!user?.email || !isAdmin(user.email)) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  let body: { action?: "approve" | "reject" };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const action = String(body.action ?? "").toLowerCase();
  if (action !== "approve" && action !== "reject") {
    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const { data: app, error: appError } = await admin
    .from("cleaner_applications")
    .select("id, name, phone, location, city_id, status")
    .eq("id", id)
    .maybeSingle();
  if (appError) return NextResponse.json({ error: appError.message }, { status: 500 });
  if (!app) return NextResponse.json({ error: "Application not found." }, { status: 404 });
  if (app.status === "approved" || app.status === "rejected") {
    return NextResponse.json({ error: "Application already reviewed." }, { status: 409 });
  }

  if (action === "reject") {
    const { error } = await admin.from("cleaner_applications").update({ status: "rejected" }).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, status: "rejected" });
  }

  const digits = String(app.phone ?? "").replace(/\D/g, "");
  const fallbackEmail = `cleaner+${digits || Date.now()}@shalean.local`;
  const tempPassword = `Clean${Math.floor(100000 + Math.random() * 900000)}`;
  let createdCleaner: { id: string; phone_number: string | null; phone: string | null };
  try {
    const created = await createCleaner({
      admin,
      email: fallbackEmail,
      password: tempPassword,
      fullName: String(app.name ?? ""),
      phone: String(app.phone ?? ""),
      cityId: app.city_id ?? null,
    });
    createdCleaner = {
      id: created.cleanerId,
      phone_number: created.phoneNumber,
      phone: created.phoneNumber,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not create cleaner auth user.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const { error: updateErr } = await admin.from("cleaner_applications").update({ status: "approved" }).eq("id", id);
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  const phone = String(createdCleaner.phone_number ?? createdCleaner.phone ?? app.phone ?? "").trim();
  await linkCleanerReferralOnApproval({
    admin,
    cleanerId: createdCleaner.id,
    cleanerPhone: phone,
  });
  if (phone) {
    await sendCleanerApprovedWhatsApp({ cleanerPhone: phone, cleanerId: createdCleaner.id });
    await sendCleanerOnboardingWhatsApp({ cleanerPhone: phone, cleanerId: createdCleaner.id });
  }

  return NextResponse.json({ ok: true, status: "approved", cleanerId: createdCleaner.id });
}
