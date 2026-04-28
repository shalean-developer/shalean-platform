import { NextResponse } from "next/server";
import { fetchCleanerTeamIds } from "@/lib/cleaner/cleanerBookingAccess";
import { resolveCleanerFromRequest } from "@/lib/cleaner/resolveCleanerFromRequest";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }
  const session = await resolveCleanerFromRequest(request, admin);
  if (!session.ok) {
    return NextResponse.json({ error: session.error, cleaner: null, user: null }, { status: session.status });
  }

  const { data: cleaner, error } = await admin
    .from("cleaners")
    .select("id, full_name, phone, phone_number, email, status, is_available, rating, jobs_completed, created_at, location")
    .eq("id", session.cleaner.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message, cleaner: null, user: session.authUser }, { status: 500 });
  }

  if (!cleaner) {
    return NextResponse.json({ cleaner: null, user: session.authUser, isCleaner: false, teamIds: [] as string[] });
  }

  const teamIds = await fetchCleanerTeamIds(admin, session.cleaner.id);
  return NextResponse.json({
    cleaner,
    user: session.authUser,
    isCleaner: true,
    teamIds,
  });
}

export async function PATCH(request: Request) {
  let body: { is_available?: boolean };
  try {
    body = (await request.json()) as { is_available?: boolean };
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  if (typeof body.is_available !== "boolean") {
    return NextResponse.json({ error: "is_available must be boolean." }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }
  const session = await resolveCleanerFromRequest(request, admin);
  if (!session.ok) {
    return NextResponse.json({ error: session.error, cleaner: null, user: null }, { status: session.status });
  }

  const status = body.is_available ? "available" : "offline";
  const { data: cleaner, error } = await admin
    .from("cleaners")
    .update({ is_available: body.is_available, status })
    .eq("id", session.cleaner.id)
    .select("id, full_name, phone, phone_number, email, status, is_available, rating, jobs_completed, created_at, location")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message, cleaner: null, user: session.authUser }, { status: 500 });
  }

  if (!cleaner) {
    return NextResponse.json({ error: "Cleaner not found.", cleaner: null, user: session.authUser }, { status: 404 });
  }

  const teamIds = await fetchCleanerTeamIds(admin, session.cleaner.id);
  return NextResponse.json({ cleaner, user: session.authUser, isCleaner: true, teamIds });
}
