import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminFromRequest } from "@/lib/admin/requireAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Operations queue for soft-fulfillment bookings:
 * - Pending Assignment: paid ops_assignment reserves awaiting manual assign
 * - Area Review: unpaid expansion leads
 */
export async function GET(request: Request) {
  const auth = await requireAdminFromRequest(request);
  if (!auth.ok) return auth.response;

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Service unavailable." }, { status: 503 });
  }

  const url = new URL(request.url);
  const queue = (url.searchParams.get("queue") ?? "all").trim().toLowerCase();

  const select =
    "id, status, fulfillment_mode, fulfillment_reason, customer_name, customer_email, customer_phone, suburb, city, postal_code, service, service_slug, date, time, created_at, payment_status, amount_paid_cents, cleaner_id, assigned_team_id, location";

  const [opsRes, areaRes] = await Promise.all([
    admin
      .from("bookings")
      .select(select)
      .eq("fulfillment_mode", "ops_assignment")
      .eq("status", "pending")
      .is("cleaner_id", null)
      .order("created_at", { ascending: true })
      .limit(100),
    admin
      .from("bookings")
      .select(select)
      .eq("status", "area_review")
      .order("created_at", { ascending: true })
      .limit(100),
  ]);

  if (opsRes.error || areaRes.error) {
    console.error("[ops-queue]", opsRes.error?.message, areaRes.error?.message);
    return NextResponse.json({ error: "Could not load ops queue." }, { status: 500 });
  }

  const pendingAssignment = opsRes.data ?? [];
  const areaReview = areaRes.data ?? [];

  if (queue === "pending_assignment") {
    return NextResponse.json({
      pendingAssignment,
      areaReview: [],
      counts: { pendingAssignment: pendingAssignment.length, areaReview: areaReview.length },
    });
  }
  if (queue === "area_review") {
    return NextResponse.json({
      pendingAssignment: [],
      areaReview,
      counts: { pendingAssignment: pendingAssignment.length, areaReview: areaReview.length },
    });
  }

  return NextResponse.json({
    pendingAssignment,
    areaReview,
    counts: {
      pendingAssignment: pendingAssignment.length,
      areaReview: areaReview.length,
    },
  });
}
