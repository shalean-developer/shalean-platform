import { NextResponse } from "next/server";
import { getSupabaseAdmin, supabaseAdminNotConfiguredBody } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type AvailableCleanerDto = {
  id: string;
  name: string;
  /** Average review score 0–5 */
  rating: number;
  jobs: number;
  /** 0–100, derived from rating for display */
  recommendPct: number;
  /** Public photo URL when present */
  image: string | null;
};

export async function GET() {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json(supabaseAdminNotConfiguredBody(), { status: 503 });

  const { data, error } = await admin
    .from("cleaners")
    .select("id, full_name, rating, jobs_completed")
    .eq("is_active", true)
    .eq("is_available", true)
    .order("rating", { ascending: false })
    .limit(5);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const cleaners: AvailableCleanerDto[] = (Array.isArray(data) ? data : [])
    .map((row) => {
      const r = row as {
        id?: string;
        full_name?: string | null;
        rating?: number | null;
        jobs_completed?: number | null;
      };
      const id = typeof r.id === "string" ? r.id : "";
      const name = typeof r.full_name === "string" && r.full_name.trim() ? r.full_name.trim() : "Cleaner";
      const ratingNum = r.rating != null && Number.isFinite(Number(r.rating)) ? Number(r.rating) : 0;
      const jobs =
        r.jobs_completed != null && Number.isFinite(Number(r.jobs_completed)) ? Math.max(0, Math.floor(Number(r.jobs_completed))) : 0;
      const recommendPct = Math.min(100, Math.max(0, Math.round((ratingNum / 5) * 100)));
      return { id, name, rating: ratingNum, jobs, recommendPct, image: null as string | null };
    })
    .filter((c) => c.id.length > 0);

  return NextResponse.json({ cleaners });
}
