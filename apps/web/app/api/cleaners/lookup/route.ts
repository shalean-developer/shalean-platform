import { NextResponse } from "next/server";
import { getSupabaseAdmin, supabaseAdminNotConfiguredBody } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Display-only cleaner lookup by id (full_name). Not slot-aware — never use for eligibility.
 */
export async function GET(request: Request) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json(supabaseAdminNotConfiguredBody(), { status: 503 });

  const id = new URL(request.url).searchParams.get("cleanerId")?.trim() ?? "";
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ ok: false as const, error: "cleanerId must be a UUID." }, { status: 400 });
  }

  const { data, error } = await admin.from("cleaners").select("id, full_name").eq("id", id).maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false as const, error: error.message }, { status: 500 });
  }
  if (!data || typeof data !== "object") {
    return NextResponse.json({ ok: false as const, error: "Not found." }, { status: 404 });
  }

  const row = data as { id?: string; full_name?: string | null };
  const displayName =
    typeof row.full_name === "string" && row.full_name.trim() ? row.full_name.trim() : "Selected cleaner";

  const res = NextResponse.json({
    ok: true as const,
    id: row.id ?? id,
    displayName,
    /** Hint for clients — scheduling remains `/api/booking/cleaners`. */
    schedulingHint: "Use /api/booking/cleaners with slot params for availability.",
  });
  res.headers.set("X-Shalean-Cleaner-Lookup", "display-only-not-slot-aware");
  return res;
}
