import { NextResponse } from "next/server";
import { resolveCleanerIdFromRequest } from "@/lib/cleaner/session";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }
  const session = await resolveCleanerIdFromRequest(request, admin);
  if (!session.cleanerId) return NextResponse.json({ error: session.error ?? "Unauthorized." }, { status: session.status ?? 401 });

  const { data: cleaner, error } = await admin
    .from("cleaners")
    .select("id, full_name, phone, phone_number, email, status, is_available, rating, jobs_completed, created_at, location")
    .eq("id", session.cleanerId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!cleaner) {
    return NextResponse.json({ cleaner: null, isCleaner: false });
  }

  return NextResponse.json({ cleaner, isCleaner: true });
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
  const session = await resolveCleanerIdFromRequest(request, admin);
  if (!session.cleanerId) return NextResponse.json({ error: session.error ?? "Unauthorized." }, { status: session.status ?? 401 });

  const status = body.is_available ? "available" : "offline";
  const { data: cleaner, error } = await admin
    .from("cleaners")
    .update({ is_available: body.is_available, status })
    .eq("id", session.cleanerId)
    .select("id, full_name, phone, phone_number, email, status, is_available, rating, jobs_completed, created_at, location")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!cleaner) {
    return NextResponse.json({ error: "Cleaner not found." }, { status: 404 });
  }

  return NextResponse.json({ cleaner, isCleaner: true });
}
