import { NextResponse } from "next/server";

import { loadAdminCleanersList } from "@/lib/admin/loadAdminCleanersList";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { runAdminCreateCleaner } from "@/lib/cleaner/runAdminCreateCleaner";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  const urlObj = new URL(request.url);
  const search = urlObj.searchParams.get("search")?.trim() ?? "";
  const excludeTeamId = urlObj.searchParams.get("excludeTeamId")?.trim() ?? "";
  const rosterFilter = urlObj.searchParams.get("filter")?.trim().toLowerCase() ?? "all";
  const limitRaw = urlObj.searchParams.get("limit");
  const defaultLimit = excludeTeamId.length > 0 ? 20 : undefined;
  const parsedLimit = limitRaw != null ? parseInt(limitRaw, 10) : defaultLimit;
  const limit =
    parsedLimit != null && Number.isFinite(parsedLimit) && parsedLimit > 0
      ? Math.min(200, parsedLimit)
      : undefined;

  try {
    const cleaners = await loadAdminCleanersList(admin, {
      search: search || undefined,
      excludeTeamId: excludeTeamId || undefined,
      filter:
        rosterFilter === "available" || rosterFilter === "high_rated" ? rosterFilter : "all",
      limit: search || excludeTeamId ? limit : undefined,
    });
    return NextResponse.json({ cleaners });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: {
    fullName?: string;
    phone?: string;
    email?: string | null;
    password?: string;
    cityId?: string | null;
    location?: string | null;
    availabilityStart?: string | null;
    availabilityEnd?: string | null;
    isAvailable?: boolean;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const fullName = String(body.fullName ?? "").trim();
  const phone = String(body.phone ?? "").trim();
  const password = String(body.password ?? "");
  const email = (body.email ?? "").toString().trim() || null;
  const cityId = body.cityId?.trim() || null;
  const location = body.location?.trim() || null;
  const availabilityStart = body.availabilityStart?.trim() || null;
  const availabilityEnd = body.availabilityEnd?.trim() || null;
  const isAvailable = body.isAvailable ?? true;

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  try {
    const created = await runAdminCreateCleaner(admin, {
      fullName,
      phone,
      password,
      email,
      cityId,
      location,
      availabilityStart,
      availabilityEnd,
      isAvailable,
    });
    return NextResponse.json({ ok: true, cleanerId: created.cleanerId, email: created.email }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create cleaner.";
    const conflict = message.toLowerCase().includes("already");
    return NextResponse.json({ error: message }, { status: conflict ? 409 : 400 });
  }
}
