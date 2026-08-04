import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin/requireAdminSession";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Policy = "legacy_july" | "current_v1";

const FUTURE_UNPAID_PAYOUT_FILTER = "payout_status.is.null,payout_status.neq.paid";

export async function GET(request: Request) {
  const auth = await requireAdminSession(request);
  if (!auth.ok) return auth.response;
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const [{ data: plans, error: plansError }, { data: customers, error: customersError }] = await Promise.all([
    admin.from("recurring_bookings").select("id,customer_id,status,frequency,start_date,end_date,price,earnings_policy,legacy_earnings_cents,earnings_policy_locked_at,booking_snapshot_template").order("status").order("created_at", { ascending: false }),
    admin.from("customer_earnings_policies").select("customer_id,earnings_policy,legacy_earnings_cents,applies_to_services,reason,locked_at,updated_at").order("updated_at", { ascending: false }),
  ]);
  if (plansError) return NextResponse.json({ error: plansError.message }, { status: 500 });
  if (customersError) return NextResponse.json({ error: customersError.message }, { status: 500 });

  const ids = Array.from(new Set([...(plans ?? []).map((x) => x.customer_id), ...(customers ?? []).map((x) => x.customer_id)].filter(Boolean)));
  const users = new Map<string, { email: string | null; name: string | null }>();
  for (const id of ids) {
    const result = await admin.auth.admin.getUserById(String(id));
    const user = result.data.user;
    const metadata = user?.user_metadata as Record<string, unknown> | undefined;
    users.set(String(id), {
      email: user?.email ?? null,
      name: typeof metadata?.full_name === "string" ? metadata.full_name : typeof metadata?.name === "string" ? metadata.name : null,
    });
  }

  return NextResponse.json({
    recurring: (plans ?? []).map((row) => ({ ...row, customer: users.get(String(row.customer_id)) ?? null })),
    customers: (customers ?? []).map((row) => ({ ...row, customer: users.get(String(row.customer_id)) ?? null })),
  });
}

export async function PATCH(request: Request) {
  const auth = await requireAdminSession(request);
  if (!auth.ok) return auth.response;
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const kind = body.kind === "customer" ? "customer" : "recurring";
  const id = typeof body.id === "string" ? body.id : "";
  const policy = body.earnings_policy as Policy;
  const amountRand = Number(body.legacy_earnings_rand);
  const amountCents = policy === "legacy_july" ? Math.round(amountRand * 100) : null;
  const now = new Date().toISOString();

  if (!id || !["legacy_july", "current_v1"].includes(policy)) {
    return NextResponse.json({ error: "Invalid policy update." }, { status: 400 });
  }
  if (policy === "legacy_july" && (!Number.isFinite(amountRand) || amountRand <= 0)) {
    return NextResponse.json({ error: "A positive legacy earning is required." }, { status: 400 });
  }

  if (kind === "recurring") {
    const { data: updatedPlan, error } = await admin
      .from("recurring_bookings")
      .update({
        earnings_policy: policy,
        legacy_earnings_cents: amountCents,
        earnings_policy_locked_at: now,
        updated_at: now,
      })
      .eq("id", id)
      .select("id")
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!updatedPlan) return NextResponse.json({ error: "Recurring plan not found." }, { status: 404 });

    // Touch every future/open unpaid occurrence. The database earnings-policy
    // trigger reads the recurring plan and applies the fixed Legacy July amount
    // only to Standard/Airbnb jobs; deep and moving-cleaning remain on their
    // fixed team-member/supervisor rules. NULL payout statuses must be included.
    const { data: updatedBookings, error: bookingError } = await admin
      .from("bookings")
      .update({ earnings_policy: policy, earnings_policy_locked_at: now, updated_at: now })
      .eq("recurring_id", id)
      .or(FUTURE_UNPAID_PAYOUT_FILTER)
      .select("id");

    if (bookingError) return NextResponse.json({ error: bookingError.message }, { status: 500 });
    return NextResponse.json({ ok: true, updatedBookings: updatedBookings?.length ?? 0 });
  }

  const { error } = await admin.from("customer_earnings_policies").upsert(
    {
      customer_id: id,
      earnings_policy: policy,
      legacy_earnings_cents: amountCents,
      applies_to_services: ["airbnb"],
      reason: "Managed in Office earnings policies dashboard",
      locked_at: now,
      updated_at: now,
    },
    { onConflict: "customer_id" },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Customer-specific locks apply to existing future/open unpaid Airbnb jobs as
  // well as newly generated bookings. The trigger resolves the customer rule
  // and writes the locked amount without touching paid bookings.
  const { data: updatedBookings, error: bookingError } = await admin
    .from("bookings")
    .update({ earnings_policy: policy, earnings_policy_locked_at: now, updated_at: now })
    .eq("customer_id", id)
    .or("service_slug.eq.airbnb,service.eq.airbnb")
    .or(FUTURE_UNPAID_PAYOUT_FILTER)
    .select("id");

  if (bookingError) return NextResponse.json({ error: bookingError.message }, { status: 500 });
  return NextResponse.json({ ok: true, updatedBookings: updatedBookings?.length ?? 0 });
}
