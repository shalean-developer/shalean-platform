import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth/admin";
import {
  ADMIN_DISPATCH_SERVICE_LABELS,
  ADMIN_DISPATCH_SERVICE_SLUGS,
  type PreferredTimeBlock,
} from "@/lib/cleaner/cleanerPreferencesTypes";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeHm(h: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(h).trim());
  if (!m) return String(h).trim();
  const hh = Number(m[1]);
  const mm = m[2];
  if (!Number.isFinite(hh) || hh > 23) return String(h).trim();
  return `${String(hh).padStart(2, "0")}:${mm}`;
}

function parseBody(body: unknown): {
  preferred_areas: string[];
  preferred_services: string[];
  preferred_time_blocks: PreferredTimeBlock[];
  is_strict: boolean;
} | null {
  if (!body || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  const areasRaw = o.preferred_areas;
  const servicesRaw = o.preferred_services;
  const blocksRaw = o.preferred_time_blocks;
  const strictRaw = o.is_strict;

  const preferred_areas = Array.isArray(areasRaw)
    ? areasRaw.map((x) => String(x).trim()).filter(Boolean)
    : [];
  const preferred_services = Array.isArray(servicesRaw)
    ? servicesRaw.map((x) => String(x).trim().toLowerCase()).filter(Boolean)
    : [];
  const allowed = new Set(ADMIN_DISPATCH_SERVICE_SLUGS);
  for (const s of preferred_services) {
    if (!allowed.has(s as (typeof ADMIN_DISPATCH_SERVICE_SLUGS)[number])) return null;
  }

  const preferred_time_blocks: PreferredTimeBlock[] = [];
  if (Array.isArray(blocksRaw)) {
    for (const item of blocksRaw) {
      if (!item || typeof item !== "object") return null;
      const b = item as Record<string, unknown>;
      const day = Number(b.day);
      const start = normalizeHm(String(b.start ?? ""));
      const end = normalizeHm(String(b.end ?? ""));
      if (!Number.isInteger(day) || day < 0 || day > 6) return null;
      if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) return null;
      preferred_time_blocks.push({ day, start, end });
    }
  } else if (blocksRaw != null) {
    return null;
  }

  const is_strict = Boolean(strictRaw);
  return { preferred_areas, preferred_services, preferred_time_blocks, is_strict };
}

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "Missing cleaner id." }, { status: 400 });

  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!token) return NextResponse.json({ error: "Missing authorization." }, { status: 401 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const pub = createClient(url, anon);
  const {
    data: { user },
    error: sessionErr,
  } = await pub.auth.getUser(token);
  if (sessionErr || !user?.email || !isAdmin(user.email)) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const [{ data: prefRow, error: prefErr }, { data: locRows, error: locErr }] = await Promise.all([
    admin
      .from("cleaner_preferences")
      .select("cleaner_id, preferred_areas, preferred_services, preferred_time_blocks, is_strict, updated_at")
      .eq("cleaner_id", id)
      .maybeSingle(),
    admin.from("locations").select("id, name, slug").order("name", { ascending: true }),
  ]);

  if (prefErr) return NextResponse.json({ error: prefErr.message }, { status: 500 });
  if (locErr) return NextResponse.json({ error: locErr.message }, { status: 500 });

  const locationOptions = (locRows ?? []).map((r) => ({
    id: String((r as { id: string }).id),
    name: String((r as { name?: string }).name ?? ""),
    slug: (r as { slug?: string | null }).slug ?? null,
  }));

  const serviceOptions = ADMIN_DISPATCH_SERVICE_SLUGS.map((slug) => ({
    slug,
    label: ADMIN_DISPATCH_SERVICE_LABELS[slug],
  }));

  return NextResponse.json({
    preferences: prefRow ?? null,
    locationOptions,
    serviceOptions,
  });
}

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "Missing cleaner id." }, { status: 400 });

  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!token) return NextResponse.json({ error: "Missing authorization." }, { status: 401 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const pub = createClient(url, anon);
  const {
    data: { user },
    error: sessionErr,
  } = await pub.auth.getUser(token);
  if (sessionErr || !user?.email || !isAdmin(user.email)) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  let jsonBody: unknown;
  try {
    jsonBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = parseBody(jsonBody);
  if (!parsed) return NextResponse.json({ error: "Invalid preferences payload." }, { status: 400 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const { data: exists, error: exErr } = await admin.from("cleaners").select("id").eq("id", id).maybeSingle();
  if (exErr) return NextResponse.json({ error: exErr.message }, { status: 500 });
  if (!exists) return NextResponse.json({ error: "Cleaner not found." }, { status: 404 });

  const nowIso = new Date().toISOString();
  const { data: saved, error: upErr } = await admin
    .from("cleaner_preferences")
    .upsert(
      {
        cleaner_id: id,
        preferred_areas: parsed.preferred_areas,
        preferred_services: parsed.preferred_services,
        preferred_time_blocks: parsed.preferred_time_blocks,
        is_strict: parsed.is_strict,
        updated_at: nowIso,
      },
      { onConflict: "cleaner_id" },
    )
    .select("cleaner_id, preferred_areas, preferred_services, preferred_time_blocks, is_strict, updated_at")
    .single();

  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, preferences: saved });
}
