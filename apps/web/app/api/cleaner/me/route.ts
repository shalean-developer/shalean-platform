import { NextResponse } from "next/server";
import { fetchCleanerTeamIds } from "@/lib/cleaner/cleanerBookingAccess";
import { fetchCleanerMeRow, updateCleanerMeAvailabilityAndFetch } from "@/lib/cleaner/cleanerMeDb";
import { resolveCleanerFromRequest } from "@/lib/cleaner/resolveCleanerFromRequest";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ME_CACHE_CONTROL = "private, max-age=15, stale-while-revalidate=30";

export async function GET(request: Request) {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }
  const session = await resolveCleanerFromRequest(request, admin);
  if (!session.ok) {
    return NextResponse.json(
      { error: session.error, cleaner: null, user: null },
      { status: session.status, headers: { "Cache-Control": "no-store" } },
    );
  }

  const { data: cleaner, error } = await fetchCleanerMeRow(admin, session.cleaner.id);

  if (error) {
    return NextResponse.json(
      { error: error.message, cleaner: null, user: session.authUser },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (!cleaner) {
    return NextResponse.json(
      { cleaner: null, user: session.authUser, isCleaner: false, teamIds: [] as string[] },
      { headers: { "Cache-Control": ME_CACHE_CONTROL } },
    );
  }

  const teamIds = await fetchCleanerTeamIds(admin, session.cleaner.id);
  return NextResponse.json(
    {
      cleaner,
      user: session.authUser,
      isCleaner: true,
      teamIds,
    },
    { headers: { "Cache-Control": ME_CACHE_CONTROL } },
  );
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
    return NextResponse.json(
      { error: session.error, cleaner: null, user: null },
      { status: session.status, headers: { "Cache-Control": "no-store" } },
    );
  }

  const status = body.is_available ? "available" : "offline";
  const { data: cleaner, error } = await updateCleanerMeAvailabilityAndFetch(
    admin,
    session.cleaner.id,
    body.is_available,
    status,
  );

  if (error) {
    return NextResponse.json(
      { error: error.message, cleaner: null, user: session.authUser },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (!cleaner) {
    return NextResponse.json(
      { error: "Cleaner not found.", cleaner: null, user: session.authUser },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }

  const teamIds = await fetchCleanerTeamIds(admin, session.cleaner.id);
  return NextResponse.json(
    { cleaner, user: session.authUser, isCleaner: true, teamIds },
    { headers: { "Cache-Control": "no-store" } },
  );
}
