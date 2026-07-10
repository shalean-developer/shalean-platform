import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const [{ data: plans }, { data: memberships }] = await Promise.all([
    admin.from("membership_plans").select("*").order("sort_order"),
    admin
      .from("customer_memberships")
      .select("*, membership_plans(name, slug, discount_percent, billing_frequency)")
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  const activeCount = (memberships ?? []).filter((m) => m.status === "active").length;
  return NextResponse.json({
    plans: plans ?? [],
    memberships: memberships ?? [],
    stats: { activeMembers: activeCount, totalMemberships: (memberships ?? []).length },
  });
}

export async function POST(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  }

  if (body.action === "create_plan") {
    const { data, error } = await admin
      .from("membership_plans")
      .insert({
        slug: String(body.slug ?? "").trim() || `plan-${Date.now()}`,
        name: String(body.name ?? "").trim(),
        description: (body.description as string) ?? null,
        billing_frequency: body.billing_frequency ?? "monthly",
        price_zar: Number(body.price_zar ?? 0),
        discount_percent: Number(body.discount_percent ?? 0),
        benefits: body.benefits ?? [],
        enabled: body.enabled !== false,
      })
      .select("*")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ plan: data }, { status: 201 });
  }

  if (body.action === "update_plan") {
    const id = String(body.id ?? "");
    const { data, error } = await admin
      .from("membership_plans")
      .update({
        name: body.name,
        description: body.description,
        billing_frequency: body.billing_frequency,
        price_zar: body.price_zar,
        discount_percent: body.discount_percent,
        benefits: body.benefits,
        enabled: body.enabled,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("*")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ plan: data });
  }

  if (body.action === "assign_membership") {
    const userId = String(body.user_id ?? "");
    const planId = String(body.plan_id ?? "");
    if (!userId || !planId) {
      return NextResponse.json({ error: "user_id and plan_id required." }, { status: 400 });
    }
    await admin
      .from("customer_memberships")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("status", "active");
    const { data, error } = await admin
      .from("customer_memberships")
      .insert({ user_id: userId, plan_id: planId, status: "active" })
      .select("*")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ membership: data }, { status: 201 });
  }

  if (body.action === "set_membership_status") {
    const id = String(body.id ?? "");
    const status = String(body.status ?? "");
    const { data, error } = await admin
      .from("customer_memberships")
      .update({
        status,
        cancelled_at: status === "cancelled" ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("*")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ membership: data });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
