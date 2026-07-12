import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminFromRequest } from "@/lib/admin/requireAdmin";
import { logBookingDemandEvent } from "@/lib/booking/logBookingDemandEvent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  action: z.enum(["reject", "contact_logged", "convert_area_review", "confirm_ops"]),
  reason: z.string().optional(),
  notes: z.string().optional(),
});

/**
 * Lightweight fulfillment actions for the ops queue.
 * Assign/reassign continues to use existing admin assign endpoints.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminFromRequest(request);
  if (!auth.ok) return auth.response;

  const { id: bookingId } = await context.params;
  if (!bookingId) {
    return NextResponse.json({ error: "Missing booking id." }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Service unavailable." }, { status: 503 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid action." }, { status: 422 });
  }

  const { data: row, error: loadErr } = await admin
    .from("bookings")
    .select("id, status, fulfillment_mode, suburb, city, postal_code, service_slug, date, time, customer_email")
    .eq("id", bookingId)
    .maybeSingle();

  if (loadErr || !row) {
    return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  }

  const action = parsed.data.action;

  if (action === "reject") {
    const { error } = await admin
      .from("bookings")
      .update({
        status: "cancelled",
        fulfillment_reason: parsed.data.reason?.trim() || "ops_rejected",
      })
      .eq("id", bookingId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    void logBookingDemandEvent(admin, {
      eventType: "cancelled",
      suburb: row.suburb,
      city: row.city,
      postalCode: row.postal_code,
      serviceSlug: row.service_slug,
      requestedDate: row.date,
      requestedTime: row.time,
      fulfillmentMode: (row.fulfillment_mode as "ops_assignment" | "area_review" | "instant" | null) ?? null,
      bookingId,
      source: "admin_fulfillment",
      metadata: { reason: parsed.data.reason ?? null },
    });
    return NextResponse.json({ ok: true, status: "cancelled" });
  }

  if (action === "contact_logged") {
    const snap = {
      opsContactLoggedAt: new Date().toISOString(),
      opsContactNotes: parsed.data.notes?.trim() || null,
      opsContactBy: auth.email,
    };
    const { data: existing } = await admin
      .from("bookings")
      .select("booking_snapshot")
      .eq("id", bookingId)
      .maybeSingle();
    const prev =
      existing?.booking_snapshot && typeof existing.booking_snapshot === "object"
        ? (existing.booking_snapshot as Record<string, unknown>)
        : {};
    await admin
      .from("bookings")
      .update({ booking_snapshot: { ...prev, ...snap } })
      .eq("id", bookingId);
    return NextResponse.json({ ok: true });
  }

  if (action === "convert_area_review") {
    if (String(row.status) !== "area_review") {
      return NextResponse.json({ error: "Booking is not in area review." }, { status: 409 });
    }
    const { error } = await admin
      .from("bookings")
      .update({
        status: "pending_payment",
        fulfillment_mode: "ops_assignment",
        fulfillment_reason: "area_review_converted",
        dispatch_status: "unassigned",
      })
      .eq("id", bookingId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    void logBookingDemandEvent(admin, {
      eventType: "area_review_converted",
      suburb: row.suburb,
      city: row.city,
      postalCode: row.postal_code,
      serviceSlug: row.service_slug,
      requestedDate: row.date,
      requestedTime: row.time,
      fulfillmentMode: "ops_assignment",
      bookingId,
      source: "admin_fulfillment",
    });
    return NextResponse.json({
      ok: true,
      status: "pending_payment",
      message: "Converted to paid reserve path — send payment link from booking detail.",
    });
  }

  if (action === "confirm_ops") {
    // Marks that ops acknowledged the reserve; assignment still via assign APIs.
    await admin
      .from("bookings")
      .update({ fulfillment_reason: "ops_acknowledged" })
      .eq("id", bookingId);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
}
