import { createClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";
import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth/admin";
import { loadDispatchMetricsSnapshot, type DispatchMetricsWindow } from "@/lib/admin/metrics";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DISPATCH_METRICS_CACHE_TTL_S = 45;

const getCachedDispatchMetrics = unstable_cache(
  async (window: DispatchMetricsWindow) => {
    const admin = getSupabaseAdmin();
    if (!admin) throw new Error("Supabase admin not configured");
    return loadDispatchMetricsSnapshot(admin, window);
  },
  ["dispatch_metrics"],
  { revalidate: DISPATCH_METRICS_CACHE_TTL_S },
);

function parseWindow(raw: string | null): DispatchMetricsWindow {
  if (raw === "7d") return "7d";
  return "24h";
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!token) return NextResponse.json({ error: "Missing authorization." }, { status: 401 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const pub = createClient(url, anon);
  const {
    data: { user },
    error: userErr,
  } = await pub.auth.getUser(token);
  if (userErr || !user?.email) {
    return NextResponse.json({ error: "Invalid or expired session." }, { status: 401 });
  }
  if (!isAdmin(user.email)) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  if (!getSupabaseAdmin()) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const { searchParams } = new URL(request.url);
  const window = parseWindow(searchParams.get("window"));

  try {
    const snapshot = await getCachedDispatchMetrics(window);
    return NextResponse.json({
      ...snapshot,
      cacheTtlSeconds: DISPATCH_METRICS_CACHE_TTL_S,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
