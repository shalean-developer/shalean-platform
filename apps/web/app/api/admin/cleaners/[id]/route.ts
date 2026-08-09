import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/auth/evaluateAdminAccess";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { regenerateCleanerAvailabilityFromStoredWeekdays } from "@/lib/cleaner/regenerateCleanerAvailabilityFromStoredWeekdays";
import { syncCleanerBusyFromBookings } from "@/lib/cleaner/syncCleanerStatus";
import { syncCleanerSummary } from "@/lib/cleaner/syncCleanerSummary";
import { parseAdminJoinedAtInput } from "@/lib/admin/cleanerTenureDisplay";
import { normalizeSouthAfricaPhone, southAfricaPhoneLookupVariants } from "@/lib/utils/phone";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isCleanerUuid(id: string): boolean {
  return UUID_RE.test(id);
}

async function requireAdminFromRequest(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!token) return { ok: false as const, response: NextResponse.json({ error: "Missing authorization." }, { status: 401 }) };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return { ok: false as const, response: NextResponse.json({ error: "Server configuration error." }, { status: 503 }) };
  }

  const pub = createClient(url, anon);
  const {
    data: { user },
    error: sessionErr,
  } = await pub.auth.getUser(token);
  if (sessionErr || !user?.id) {
    return { ok: false as const, response: NextResponse.json({ error: "Invalid or expired session." }, { status: 401 }) };
  }
  const adminAuth = await requireAdminUser(user);
  if (!adminAuth.ok) {
    return { ok: false as const, response: NextResponse.json({ error: adminAuth.error }, { status: adminAuth.status }) };
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return { ok: false as const, response: NextResponse.json({ error: "Server configuration error." }, { status: 503 }) };
  }

  return { ok: true as const, admin };
}

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "Missing cleaner id." }, { status: 400 });
  if (!isCleanerUuid(id)) return NextResponse.json({ error: "Invalid cleaner id." }, { status: 400 });

  const auth = await requireAdminFromRequest(_request);
  if (!auth.ok) return auth.response;

  await syncCleanerBusyFromBookings(auth.admin, id);

  const { data, error } = await auth.admin
    .from("cleaners")
    .select(
      "id, full_name, phone, email, rating, jobs_completed, is_available, is_active, status, city_id, location, availability_start, availability_end, availability_weekdays, auth_user_id, joined_at, created_at",
    )
    .eq("id", id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Cleaner not found." }, { status: 404 });

  const bookingFields = "id, booking_reference, service, date, time, status, location";
  const [directResult, rosterResult] = await Promise.all([
    auth.admin
      .from("bookings")
      .select(bookingFields)
      .eq("cleaner_id", id)
      .order("date", { ascending: false })
      .order("time", { ascending: false })
      .limit(20),
    auth.admin.from("booking_cleaners").select("booking_id").eq("cleaner_id", id).limit(100),
  ]);

  if (directResult.error) return NextResponse.json({ error: directResult.error.message }, { status: 500 });
  if (rosterResult.error) return NextResponse.json({ error: rosterResult.error.message }, { status: 500 });

  const directBookings = Array.isArray(directResult.data) ? directResult.data : [];
  const directIds = new Set(directBookings.map((booking) => String(booking.id)));
  const rosterBookingIds = (rosterResult.data ?? [])
    .map((row) => String(row.booking_id ?? "").trim())
    .filter((bookingId) => bookingId && !directIds.has(bookingId));

  let rosterBookings: typeof directBookings = [];
  if (rosterBookingIds.length > 0) {
    const rosterBookingsResult = await auth.admin
      .from("bookings")
      .select(bookingFields)
      .in("id", rosterBookingIds)
      .order("date", { ascending: false })
      .order("time", { ascending: false })
      .limit(20);
    if (rosterBookingsResult.error) {
      return NextResponse.json({ error: rosterBookingsResult.error.message }, { status: 500 });
    }
    rosterBookings = rosterBookingsResult.data ?? [];
  }

  const assignedBookings = [...directBookings, ...rosterBookings]
    .sort((a, b) => `${b.date ?? ""}T${b.time ?? ""}`.localeCompare(`${a.date ?? ""}T${a.time ?? ""}`))
    .slice(0, 20);

  return NextResponse.json({ cleaner: data, assignedBookings });
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "Missing cleaner id." }, { status: 400 });
  if (!isCleanerUuid(id)) return NextResponse.json({ error: "Invalid cleaner id." }, { status: 400 });

  const auth = await requireAdminFromRequest(request);
  if (!auth.ok) return auth.response;
  const admin = auth.admin;

  // Email is updated only via POST /api/admin/update-cleaner-email (syncs auth.users + cleaners).
  // `location` + `availability_weekdays` on `cleaners` are derived from `cleaner_locations` + `cleaner_availability`
  // (ignored if present in JSON for backward compatibility).

  let body: {
    status?: string;
    full_name?: string;
    phone?: string;
    location?: string | null;
    availability_start?: string | null;
    availability_end?: string | null;
    is_available?: boolean;
    is_active?: boolean;
    availability_weekdays?: string[];
    joined_at?: string | null;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (body.status !== undefined) {
    const status = String(body.status ?? "").trim().toLowerCase();
    const allowed = new Set(["available", "busy", "offline"]);
    if (!allowed.has(status)) return NextResponse.json({ error: "Invalid status." }, { status: 400 });
    updates.status = status;
  }
  if (body.full_name !== undefined) {
    const fullName = String(body.full_name).trim();
    if (!fullName) return NextResponse.json({ error: "Full name is required." }, { status: 400 });
    updates.full_name = fullName;
  }
  if (body.phone !== undefined) {
    const raw = String(body.phone).trim();
    if (!raw) return NextResponse.json({ error: "Phone is required." }, { status: 400 });
    const phoneNorm = normalizeSouthAfricaPhone(raw);
    if (!phoneNorm) return NextResponse.json({ error: "Invalid South Africa phone number." }, { status: 400 });
    const variants = southAfricaPhoneLookupVariants(raw);
    const { data: dupRows, error: dupErr } = await admin
      .from("cleaners")
      .select("id")
      .in("phone", variants)
      .neq("id", id)
      .limit(1);
    if (dupErr) return NextResponse.json({ error: dupErr.message }, { status: 500 });
    if (dupRows?.length) return NextResponse.json({ error: "Phone number already exists." }, { status: 409 });
    const dupNum = await admin.from("cleaners").select("id").in("phone_number", variants).neq("id", id).limit(1);
    if (!dupNum.error && dupNum.data?.length) {
      return NextResponse.json({ error: "Phone number already exists." }, { status: 409 });
    }
    updates.phone = phoneNorm;
  }
  if (body.availability_start !== undefined) updates.availability_start = body.availability_start || null;
  if (body.availability_end !== undefined) updates.availability_end = body.availability_end || null;
  if (body.joined_at !== undefined) {
    if (body.joined_at == null || String(body.joined_at).trim() === "") {
      updates.joined_at = null;
    } else {
      const parsed = parseAdminJoinedAtInput(String(body.joined_at));
      if (!parsed) {
        return NextResponse.json({ error: "Invalid company join date." }, { status: 400 });
      }
      updates.joined_at = parsed;
    }
  }
  if (body.is_available !== undefined) {
    updates.is_available = Boolean(body.is_available);
    if (body.status === undefined) {
      updates.status = body.is_available ? "available" : "offline";
    }
  }
  if (body.is_active !== undefined) {
    updates.is_active = Boolean(body.is_active);
    // Archiving is deliberately non-destructive: preserve the cleaner id and
    // all historical booking/earnings links, but remove dispatch eligibility.
    if (!body.is_active) {
      updates.is_available = false;
      updates.status = "offline";
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update." }, { status: 400 });
  }

  const { error } = await admin.from("cleaners").update(updates).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const shouldRegenSlots = body.availability_start !== undefined || body.availability_end !== undefined;
  try {
    if (shouldRegenSlots) {
      await regenerateCleanerAvailabilityFromStoredWeekdays(admin, id, { horizonDays: 60 });
    }
    await syncCleanerSummary(admin, id);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Summary sync failed." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
