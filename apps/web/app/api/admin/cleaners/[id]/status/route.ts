import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/auth/evaluateAdminAccess";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { normalizeCleanerStatus } from "@/lib/cleaner/cleanerStatus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Invalid cleaner id." }, { status: 400 });

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!token) return NextResponse.json({ error: "Missing authorization." }, { status: 401 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const pub = createClient(url, anon);
  const { data: { user }, error: userError } = await pub.auth.getUser(token);
  if (userError || !user?.id) return NextResponse.json({ error: "Invalid or expired session." }, { status: 401 });
  const adminAuth = await requireAdminUser(user);
  if (!adminAuth.ok) return NextResponse.json({ error: adminAuth.error }, { status: adminAuth.status });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  let body: { status?: string };
  try { body = (await request.json()) as { status?: string }; }
  catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }

  const status = normalizeCleanerStatus(body.status);
  if (!status) return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  if (status === "busy") {
    return NextResponse.json({ error: "Busy is automatic and can only be set by an in-progress booking." }, { status: 400 });
  }

  const updates: Record<string, unknown> = {
    status,
    is_available: status === "available",
  };
  if (status === "inactive") updates.is_active = false;

  const { error } = await admin.from("cleaners").update(updates).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, status });
}
