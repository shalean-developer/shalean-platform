import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth/admin";
import { backfillAllCleanersMissingAuth } from "@/lib/cleaner/linkCleanerAuth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!token) return NextResponse.json({ error: "Missing authorization." }, { status: 401 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const pub = createClient(url, anon);
  const {
    data: { user },
  } = await pub.auth.getUser(token);
  if (!user?.email || !isAdmin(user.email)) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const defaultPassword =
    process.env.CLEANER_AUTH_BACKFILL_DEFAULT_PASSWORD ?? "Temp1234!ChangeMe";

  try {
    const result = await backfillAllCleanersMissingAuth(admin, { defaultPassword });
    const failures = result.failures.slice(0, 40);
    return NextResponse.json({
      result: { ...result, failures },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Backfill failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
