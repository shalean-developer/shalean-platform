import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { cleanerManagementStatus } from "@/lib/admin/cleanerManagementStatus";
import { isUnknownColumnError } from "@/lib/cleaner/cleanerMeDb";

export type AdminCleanerListRow = {
  id: string;
  full_name: string | null;
  phone: string | null;
  auth_user_id: string | null;
  rating: number | null;
  jobs_completed: number | null;
  is_available: boolean | null;
  is_active: boolean | null;
  home_lat: number | null;
  home_lng: number | null;
  email: string | null;
  status: string | null;
  city_id: string | null;
  location: string | null;
  availability_start: string | null;
  availability_end: string | null;
  availability_weekdays?: string[] | null;
};

const SELECT_WITH_WEEKDAYS = `
  id,
  full_name,
  phone,
  auth_user_id,
  rating,
  jobs_completed,
  is_available,
  is_active,
  home_lat,
  home_lng,
  email,
  status,
  city_id,
  location,
  availability_start,
  availability_end,
  availability_weekdays
`;

const SELECT_BASE = `
  id,
  full_name,
  phone,
  auth_user_id,
  rating,
  jobs_completed,
  is_available,
  is_active,
  home_lat,
  home_lng,
  email,
  status,
  city_id,
  location,
  availability_start,
  availability_end
`;

export type LoadAdminCleanersListOptions = {
  search?: string;
  excludeTeamId?: string;
  /** `all` | `available` (dispatchable active rows) | `high_rated` (rating ≥ 4). */
  filter?: "all" | "available" | "high_rated";
  /** Optional cap for typeahead pickers; omit to return every matching row. */
  limit?: number;
};

function projectOfficeStatus(row: AdminCleanerListRow): AdminCleanerListRow {
  const status = cleanerManagementStatus(row);
  return { ...row, status, is_available: status !== "offline" };
}

/** Loads every cleaner row from `public.cleaners` (paginated), with optional filters. */
export async function loadAdminCleanersList(
  admin: SupabaseClient,
  options: LoadAdminCleanersListOptions = {},
): Promise<AdminCleanerListRow[]> {
  const search = String(options.search ?? "").trim();
  const escaped = search.replace(/%/g, "\\%").replace(/,/g, "");
  const excludeTeamId = String(options.excludeTeamId ?? "").trim();
  const rosterFilter = String(options.filter ?? "all").trim().toLowerCase();
  const hardLimit =
    typeof options.limit === "number" && options.limit > 0
      ? Math.min(200, Math.max(1, Math.round(options.limit)))
      : null;

  let excludeIds: string[] = [];
  if (excludeTeamId.length > 0) {
    const { data: tm, error: tmErr } = await admin
      .from("team_members")
      .select("cleaner_id")
      .eq("team_id", excludeTeamId)
      .not("cleaner_id", "is", null);
    if (tmErr) throw new Error(tmErr.message);
    excludeIds = [
      ...new Set(
        (tm ?? [])
          .map((r: { cleaner_id?: string | null }) => String(r.cleaner_id ?? "").trim())
          .filter((id) => id.length > 0),
      ),
    ];
  }

  const fetchPage = async (columns: string, from: number, pageSize: number) => {
    let q = admin.from("cleaners").select(columns);
    if (rosterFilter === "available") {
      q = q.eq("is_available", true).neq("is_active", false);
    } else if (rosterFilter === "high_rated") {
      q = q.gte("rating", 4);
    }
    if (escaped.length > 0) {
      q = q.or(`full_name.ilike.%${escaped}%,phone.ilike.%${escaped}%`);
    }
    if (excludeIds.length > 0) {
      q = q.not("id", "in", `(${excludeIds.join(",")})`);
    }
    if (rosterFilter === "high_rated") {
      q = q.order("rating", { ascending: false, nullsFirst: true }).order("full_name", { ascending: true });
    } else {
      q = q.order("full_name", { ascending: true });
    }
    return q.range(from, from + pageSize - 1);
  };

  const pageSize = hardLimit ?? 500;
  const all: AdminCleanerListRow[] = [];

  for (let from = 0; ; from += pageSize) {
    const take = hardLimit != null ? Math.min(pageSize, hardLimit - all.length) : pageSize;
    if (take <= 0) break;

    let res = await fetchPage(SELECT_WITH_WEEKDAYS, from, take);
    if (res.error && isUnknownColumnError(res.error, "availability_weekdays")) {
      res = await fetchPage(SELECT_BASE, from, take);
    }
    if (res.error) throw new Error(res.error.message);

    const rows = (Array.isArray(res.data) ? res.data : []) as unknown as AdminCleanerListRow[];
    all.push(...rows.map(projectOfficeStatus));
    if (rows.length < take) break;
    if (hardLimit != null && all.length >= hardLimit) break;
  }

  return all;
}
