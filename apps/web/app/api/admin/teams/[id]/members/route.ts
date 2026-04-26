import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth/admin";
import { TEAM_MEMBER_ADD_CODE } from "@/lib/admin/teamMemberAddCodes";
import {
  getCachedTeamMemberAddResponse,
  setCachedTeamMemberAddResponse,
  teamMemberAddIdempotencyFingerprint,
} from "@/lib/admin/teamMemberAddIdempotency";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AdminAuth =
  | { ok: false; status: number; error: string }
  | { ok: true; adminUserId: string; adminEmail: string | null };

async function ensureAdmin(request: Request): Promise<AdminAuth> {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!token) return { ok: false, status: 401, error: "Missing authorization." };
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return { ok: false, status: 503, error: "Server configuration error." };
  const pub = createClient(url, anon);
  const {
    data: { user },
  } = await pub.auth.getUser(token);
  if (!user?.id || !user.email || !isAdmin(user.email)) return { ok: false, status: 403, error: "Forbidden." };
  return { ok: true, adminUserId: user.id, adminEmail: user.email ?? null };
}

type CleanerJoin = { full_name?: string | null; phone?: string | null; phone_number?: string | null } | null;

function mapJoinedRow(
  cleanerId: string,
  activeFrom: string | null,
  c: CleanerJoin,
): { cleaner_id: string; name: string; phone: string | null; joined_at: string | null } {
  const phoneRaw = (c?.phone_number ?? c?.phone ?? "").trim();
  return {
    cleaner_id: cleanerId,
    name: (c?.full_name ?? "").trim() || "Unknown cleaner",
    phone: phoneRaw.length > 0 ? phoneRaw : null,
    joined_at: activeFrom,
  };
}

type RosterPage = { limit?: number; offset?: number };

/** Embed join first; if PostgREST/embed fails, load team_members + cleaners separately (no 500 from naming drift). */
async function loadTeamMembersRoster(admin: SupabaseClient, teamId: string, page?: RosterPage) {
  const limit = page?.limit;
  const offset = page?.offset ?? 0;
  const rangeEnd = limit != null ? offset + limit - 1 : undefined;

  let embed = admin
    .from("team_members")
    .select("cleaner_id, active_from, cleaners ( full_name, phone, phone_number )")
    .eq("team_id", teamId)
    .not("cleaner_id", "is", null)
    .order("active_from", { ascending: false });
  if (limit != null && rangeEnd != null) embed = embed.range(offset, rangeEnd);
  const embedRes = await embed;

  if (!embedRes.error && embedRes.data) {
    const members = (embedRes.data as { cleaner_id?: string; active_from?: string | null; cleaners?: CleanerJoin }[]).map(
      (row) => {
        const cleanerId = String(row.cleaner_id ?? "").trim();
        return mapJoinedRow(cleanerId, row.active_from ?? null, row.cleaners ?? null);
      },
    );
    return members.filter((m) => m.cleaner_id);
  }

  let base = admin
    .from("team_members")
    .select("cleaner_id, active_from")
    .eq("team_id", teamId)
    .not("cleaner_id", "is", null)
    .order("active_from", { ascending: false });
  if (limit != null && rangeEnd != null) base = base.range(offset, rangeEnd);
  const baseRes = await base;
  if (baseRes.error) {
    throw new Error(baseRes.error.message);
  }
  const rows = baseRes.data ?? [];
  const ids = [...new Set(rows.map((r) => String((r as { cleaner_id?: string }).cleaner_id ?? "").trim()).filter(Boolean))];
  if (ids.length === 0) return [];

  const cleanRes = await admin.from("cleaners").select("id, full_name, phone, phone_number").in("id", ids);
  if (cleanRes.error) {
    throw new Error(cleanRes.error.message);
  }
  const byId = new Map<string, CleanerJoin>();
  for (const c of cleanRes.data ?? []) {
    const id = String((c as { id?: string }).id ?? "").trim();
    if (id) byId.set(id, c as CleanerJoin);
  }
  return rows
    .map((row) => {
      const cleanerId = String((row as { cleaner_id?: string }).cleaner_id ?? "").trim();
      const activeFrom = (row as { active_from?: string | null }).active_from ?? null;
      return mapJoinedRow(cleanerId, activeFrom, byId.get(cleanerId) ?? null);
    })
    .filter((m) => m.cleaner_id);
}

const ACTIVE_TEAM_JOB_STATUSES = ["pending", "assigned", "in_progress"] as const;

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await ensureAdmin(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id: teamId } = await ctx.params;
  if (!teamId) return NextResponse.json({ error: "Missing team id." }, { status: 400 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const url = new URL(request.url);
  const limitRaw = url.searchParams.get("limit");
  let page: RosterPage | undefined;
  if (limitRaw != null && limitRaw !== "") {
    const limit = Math.min(500, Math.max(1, parseInt(limitRaw, 10) || 100));
    const offset = Math.max(0, parseInt(url.searchParams.get("offset") ?? "0", 10) || 0);
    page = { limit, offset };
  }

  try {
    const members = await loadTeamMembersRoster(admin, teamId, page);
    const payload: { members: unknown[]; limit?: number; offset?: number } = { members };
    if (page) {
      payload.limit = page.limit;
      payload.offset = page.offset ?? 0;
    }
    return NextResponse.json(payload);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load roster.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

type RpcResult = {
  ok?: boolean;
  error?: string;
  code?: string;
  http_status?: number;
  inserted?: number;
  cleaner_ids?: unknown;
  current?: number;
  capacity?: number;
  would_add?: number;
  skipped_all_duplicates?: boolean;
};

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await ensureAdmin(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id: teamId } = await ctx.params;
  if (!teamId) return NextResponse.json({ error: "Missing team id." }, { status: 400 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const idempotencyRaw =
    request.headers.get("idempotency-key")?.trim() ?? request.headers.get("Idempotency-Key")?.trim() ?? "";
  const idempotencyKey =
    idempotencyRaw.length > 0 && idempotencyRaw.length <= 128 ? idempotencyRaw : "";
  const retryAfterBusy = request.headers.get("X-Shalean-Retry-After-Busy") === "1";

  let body: { cleanerIds?: string[] };
  try {
    body = (await request.json()) as { cleanerIds?: string[] };
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const cleanerIds = Array.isArray(body.cleanerIds)
    ? [...new Set(body.cleanerIds.map((id) => String(id ?? "").trim()).filter(Boolean))]
    : [];
  if (cleanerIds.length === 0) {
    return NextResponse.json({ error: "cleanerIds required." }, { status: 400 });
  }
  const requestedCount = cleanerIds.length;

  if (idempotencyKey.length > 0) {
    const fp = teamMemberAddIdempotencyFingerprint(teamId, idempotencyKey, cleanerIds);
    const cached = await getCachedTeamMemberAddResponse(fp);
    if (cached) {
      void logSystemEvent({
        level: "info",
        source: "TEAM_MEMBERS_ADD_ATTEMPT",
        message: "Admin add team members (idempotent replay)",
        context: {
          teamId,
          count: requestedCount,
          adminId: auth.adminUserId,
          adminEmail: auth.adminEmail,
          idempotentReplay: true,
        },
      });
      return NextResponse.json(cached.body, { status: cached.status });
    }
  }

  void logSystemEvent({
    level: "info",
    source: "TEAM_MEMBERS_ADD_ATTEMPT",
    message: "Admin add team members",
    context: {
      teamId,
      count: requestedCount,
      adminId: auth.adminUserId,
      adminEmail: auth.adminEmail,
    },
  });

  if (cleanerIds.length > 20) {
    void logSystemEvent({
      level: "warn",
      source: "TEAM_MEMBERS_ADD_FAILED",
      message: "Admin add team members rejected (rate limit)",
      context: {
        teamId,
        reason: "Too many IDs at once.",
        code: TEAM_MEMBER_ADD_CODE.TOO_MANY_IDS,
        adminId: auth.adminUserId,
        adminEmail: auth.adminEmail,
        count: requestedCount,
      },
    });
    return NextResponse.json(
      { error: "Too many IDs at once.", code: TEAM_MEMBER_ADD_CODE.TOO_MANY_IDS },
      { status: 400 },
    );
  }

  const { data: rpcRaw, error: rpcErr } = await admin.rpc("add_team_members_guarded", {
    p_team_id: teamId,
    p_cleaner_ids: cleanerIds,
  });
  if (rpcErr) {
    void logSystemEvent({
      level: "error",
      source: "TEAM_MEMBERS_ADD_FAILED",
      message: "Admin add team members RPC error",
      context: {
        teamId,
        reason: rpcErr.message,
        adminId: auth.adminUserId,
        adminEmail: auth.adminEmail,
        count: requestedCount,
      },
    });
    return NextResponse.json({ error: rpcErr.message }, { status: 500 });
  }

  const result = (rpcRaw ?? {}) as RpcResult;
  if (!result.ok) {
    const status = typeof result.http_status === "number" ? result.http_status : 400;
    const code = typeof result.code === "string" ? result.code : undefined;
    if (code === TEAM_MEMBER_ADD_CODE.EXCEEDS_CAPACITY) {
      void logSystemEvent({
        level: "warn",
        source: "TEAM_MEMBERS_ADD_CAPACITY_REJECT",
        message: "Admin add team members rejected (capacity)",
        context: {
          teamId,
          code,
          adminId: auth.adminUserId,
          adminEmail: auth.adminEmail,
          count: requestedCount,
          current: result.current,
          capacity: result.capacity,
          would_add: result.would_add,
        },
      });
    } else if (code === TEAM_MEMBER_ADD_CODE.VERIFY_FAILED) {
      void logSystemEvent({
        level: "error",
        source: "TEAM_MEMBERS_ADD_VERIFY_FAIL",
        message: "Admin add team members verification failed",
        context: {
          teamId,
          code,
          adminId: auth.adminUserId,
          adminEmail: auth.adminEmail,
          count: requestedCount,
        },
      });
    } else {
      void logSystemEvent({
        level: status >= 500 ? "error" : "warn",
        source: "TEAM_MEMBERS_ADD_FAILED",
        message: "Admin add team members rejected",
        context: {
          teamId,
          reason: result.error ?? "Request failed.",
          code,
          adminId: auth.adminUserId,
          adminEmail: auth.adminEmail,
          count: requestedCount,
        },
      });
    }
    return NextResponse.json(
      {
        error: result.error ?? "Request failed.",
        code,
        current: result.current,
        capacity: result.capacity,
        would_add: result.would_add,
      },
      { status },
    );
  }

  const inserted = typeof result.inserted === "number" ? result.inserted : 0;
  const rawIds = result.cleaner_ids;
  let addedIds: string[] = [];
  if (Array.isArray(rawIds)) {
    addedIds = rawIds.map((x) => String(x)).filter(Boolean);
  } else if (rawIds != null && typeof rawIds === "object") {
    try {
      const arr = JSON.parse(JSON.stringify(rawIds)) as unknown;
      if (Array.isArray(arr)) addedIds = arr.map((x) => String(x)).filter(Boolean);
    } catch {
      addedIds = [];
    }
  }

  if (inserted > 0) {
    void logSystemEvent({
      level: "info",
      source: "TEAM_MEMBERS_ADDED_BATCH",
      message: "Admin added cleaners to team",
      context: {
        teamId,
        count: inserted,
        cleanerIds: addedIds,
        adminId: auth.adminUserId,
        adminEmail: auth.adminEmail,
      },
    });
  }

  void logSystemEvent({
    level: "info",
    source: "TEAM_MEMBERS_ADD_SUCCESS",
    message: "Admin add team members succeeded",
    context: {
      teamId,
      inserted,
      adminId: auth.adminUserId,
      adminEmail: auth.adminEmail,
      count: requestedCount,
    },
  });

  if (retryAfterBusy) {
    void logSystemEvent({
      level: "info",
      source: "TEAM_MEMBERS_ADD_BUSY_RETRY",
      message: "Admin add team members succeeded after busy retry",
      context: {
        teamId,
        inserted,
        adminId: auth.adminUserId,
        adminEmail: auth.adminEmail,
        count: requestedCount,
      },
    });
  }

  const payload: {
    ok: boolean;
    inserted: number;
    current?: number;
    capacity?: number;
    skippedDuplicates?: number;
  } = {
    ok: true,
    inserted,
    current: typeof result.current === "number" ? result.current : undefined,
    capacity: typeof result.capacity === "number" ? result.capacity : undefined,
  };
  if (result.skipped_all_duplicates === true && cleanerIds.length > 0) {
    payload.skippedDuplicates = cleanerIds.length;
  }

  if (idempotencyKey.length > 0) {
    const fp = teamMemberAddIdempotencyFingerprint(teamId, idempotencyKey, cleanerIds);
    void setCachedTeamMemberAddResponse(fp, { status: 200, body: payload });
  }

  return NextResponse.json(payload);
}

export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await ensureAdmin(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id: teamId } = await ctx.params;
  if (!teamId) return NextResponse.json({ error: "Missing team id." }, { status: 400 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  let body: { cleanerId?: string };
  try {
    body = (await request.json()) as { cleanerId?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const cleanerId = String(body.cleanerId ?? "").trim();
  if (!cleanerId) return NextResponse.json({ error: "cleanerId required." }, { status: 400 });

  const { data: team, error: teamErr } = await admin
    .from("teams")
    .select("is_active")
    .eq("id", teamId)
    .maybeSingle();
  if (teamErr) return NextResponse.json({ error: teamErr.message }, { status: 500 });
  if (!team) return NextResponse.json({ error: "Team not found." }, { status: 404 });
  if ((team as { is_active?: boolean }).is_active !== true) {
    return NextResponse.json({ error: "Team is inactive." }, { status: 400 });
  }

  const { data: blocking, error: activeErr } = await admin
    .from("bookings")
    .select("id")
    .eq("team_id", teamId)
    .eq("is_team_job", true)
    .in("status", [...ACTIVE_TEAM_JOB_STATUSES])
    .limit(1)
    .maybeSingle();
  if (activeErr) return NextResponse.json({ error: activeErr.message }, { status: 500 });
  if (blocking) {
    return NextResponse.json({ error: "Cannot modify team with active jobs." }, { status: 409 });
  }

  const { error } = await admin.from("team_members").delete().eq("team_id", teamId).eq("cleaner_id", cleanerId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  void logSystemEvent({
    level: "info",
    source: "TEAM_MEMBER_REMOVED",
    message: "Admin removed cleaner from team",
    context: { teamId, cleanerId, adminId: auth.adminUserId, adminEmail: auth.adminEmail },
  });

  return NextResponse.json({ ok: true });
}
