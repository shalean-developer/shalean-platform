import type { SupabaseClient } from "@supabase/supabase-js";
import { isAuthoritativeBookingCompleted } from "@/lib/booking/deriveBookingOperationalPhase";
import { isPairedRosterSoloJob } from "@/lib/payout/isPairedRosterSoloJob";
export type BookingCleanerRosterLifecycleRow = {
  cleaner_id: string;
  role: string;
  completed_at?: string | null;
};

export type ViewerRosterContext = {
  pairedRosterJob: boolean;
  viewerOnRoster: boolean;
  viewerRosterRole: "lead" | "member" | null;
  viewerRosterCompletedAt: string | null;
  viewerIsPairedRosterMember: boolean;
};

export function normalizeRosterRole(role: unknown): "lead" | "member" {
  return String(role ?? "").trim().toLowerCase() === "lead" ? "lead" : "member";
}

export function rosterRowCompletedAt(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  return s || null;
}

export function viewerHasRosterVisitCompleted(ctx: Pick<ViewerRosterContext, "viewerRosterCompletedAt">): boolean {
  return Boolean(ctx.viewerRosterCompletedAt);
}

/**
 * True when the viewer is a non-lead roster cleaner on a paired solo job who may complete independently.
 */
export function viewerIsPairedRosterMemberCleaner(ctx: ViewerRosterContext): boolean {
  return ctx.viewerIsPairedRosterMember && ctx.viewerRosterRole === "member";
}

export function buildViewerRosterContext(params: {
  booking: { is_team_job?: boolean | null; cleaner_count?: number | null };
  rosterRows: readonly BookingCleanerRosterLifecycleRow[];
  viewerCleanerId: string;
}): ViewerRosterContext {
  const viewerId = params.viewerCleanerId.trim();
  const pairedRosterJob = isPairedRosterSoloJob({
    isTeamJob: params.booking.is_team_job === true,
    rosterRows: params.rosterRows,
  });
  const hit = params.rosterRows.find((r) => String(r.cleaner_id ?? "").trim() === viewerId) ?? null;
  const viewerOnRoster = hit != null;
  const viewerRosterRole = hit ? normalizeRosterRole(hit.role) : null;
  const viewerRosterCompletedAt = hit ? rosterRowCompletedAt(hit.completed_at) : null;
  const viewerIsPairedRosterMember = pairedRosterJob && viewerOnRoster && viewerRosterRole === "member";
  return {
    pairedRosterJob,
    viewerOnRoster,
    viewerRosterRole,
    viewerRosterCompletedAt,
    viewerIsPairedRosterMember,
  };
}

export function augmentRowWithViewerRosterContext(
  row: Record<string, unknown>,
  ctx: ViewerRosterContext,
): Record<string, unknown> {
  return {
    ...row,
    paired_roster_job: ctx.pairedRosterJob,
    viewer_on_roster: ctx.viewerOnRoster,
    viewer_roster_role: ctx.viewerRosterRole,
    viewer_roster_completed_at: ctx.viewerRosterCompletedAt,
    viewer_is_paired_roster_member: ctx.viewerIsPairedRosterMember,
  };
}

/**
 * Cleaner UI: roster members complete when the visit is in progress or the booking is already completed
 * (lead finished first) and they have not marked their own visit done yet.
 */
export function pairedRosterMemberShouldShowComplete(
  row: Record<string, unknown>,
  ctx: ViewerRosterContext,
): boolean {
  if (!viewerIsPairedRosterMemberCleaner(ctx)) return false;
  if (viewerHasRosterVisitCompleted(ctx)) return false;
  const st = String(row.status ?? "").trim().toLowerCase();
  if (st === "in_progress") return true;
  return isAuthoritativeBookingCompleted(row);
}

export async function fetchRosterLifecycleByBookingIds(
  admin: SupabaseClient,
  bookingIds: readonly string[],
): Promise<Map<string, BookingCleanerRosterLifecycleRow[]>> {
  const out = new Map<string, BookingCleanerRosterLifecycleRow[]>();
  const ids = [...new Set(bookingIds.map((x) => String(x ?? "").trim()).filter(Boolean))];
  if (!ids.length) return out;

  const { data, error } = await admin
    .from("booking_cleaners")
    .select("booking_id, cleaner_id, role, completed_at")
    .in("booking_id", ids)
    .order("role", { ascending: true })
    .order("cleaner_id", { ascending: true });
  if (error || !data?.length) return out;

  for (const raw of data as {
    booking_id?: string;
    cleaner_id?: string;
    role?: string;
    completed_at?: string | null;
  }[]) {
    const bid = String(raw.booking_id ?? "").trim();
    const cid = String(raw.cleaner_id ?? "").trim();
    if (!bid || !cid) continue;
    const list = out.get(bid) ?? [];
    list.push({
      cleaner_id: cid,
      role: normalizeRosterRole(raw.role),
      completed_at: rosterRowCompletedAt(raw.completed_at),
    });
    out.set(bid, list);
  }
  return out;
}

export async function augmentCleanerJobsWithViewerRosterContext(
  admin: SupabaseClient,
  rows: readonly Record<string, unknown>[],
  viewerCleanerId: string,
): Promise<Record<string, unknown>[]> {
  const ids = rows.map((r) => String(r.id ?? "").trim()).filter(Boolean);
  const rosterByBooking = await fetchRosterLifecycleByBookingIds(admin, ids);
  return rows.map((row) => {
    const id = String(row.id ?? "").trim();
    const roster = rosterByBooking.get(id) ?? [];
    const ctx = buildViewerRosterContext({
      booking: {
        is_team_job: row.is_team_job === true,
        cleaner_count: row.cleaner_count as number | null | undefined,
      },
      rosterRows: roster,
      viewerCleanerId,
    });
    return augmentRowWithViewerRosterContext(row, ctx);
  });
}
