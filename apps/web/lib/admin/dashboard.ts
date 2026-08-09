"use client";

import { TEAM_MEMBER_ADD_CODE } from "./teamMemberAddCodes";
import type { CleanerPreferencesPayload, PreferredTimeBlock } from "@/lib/cleaner/cleanerPreferencesTypes";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import type { AdminWarning } from "@/lib/admin/adminWarningPayload";

export type AdminBookingRow = {
  id: string;
  customer_email: string | null;
  service: string | null;
  date: string | null;
  time: string | null;
  total_paid_zar: number | null;
  amount_paid_cents: number | null;
  status: string | null;
  dispatch_status?: "searching" | "offered" | "assigned" | "failed" | "no_cleaner" | "unassignable" | null;
  cleaner_id: string | null;
};

/** Row shape matches `public.cleaners` columns (no legacy `phone_number`). */
export type AdminCleanerRow = {
  id: string;
  full_name: string;
  phone: string;
  auth_user_id?: string | null;
  rating: number;
  jobs_completed: number;
  is_available: boolean;
  is_active?: boolean | null;
  home_lat?: number | null;
  home_lng?: number | null;
  email?: string | null;
  status?: string | null;
  city_id?: string | null;
  location?: string | null;
  availability_start?: string | null;
  availability_end?: string | null;
  /** Lowercase mon..sun from `cleaners.availability_weekdays`. */
  availability_weekdays?: string[] | null;
};

export type CleanerAuthBackfillResult = {
  scanned: number;
  missingAuth: number;
  linked: number;
  failed: number;
  failures: { cleanerId: string; message: string }[];
};

export type AdminCustomerRow = {
  email: string;
  totalBookings: number;
  totalSpendZar: number;
  lastBookingAt: string | null;
  status: "active" | "inactive";
};

export class AdminDashboardActionError extends Error {
  warnings: AdminWarning[];
  code?: string;
  blocking?: boolean;

  constructor(message: string, details?: { warnings?: AdminWarning[]; code?: string; blocking?: boolean }) {
    super(message);
    this.name = "AdminDashboardActionError";
    this.warnings = details?.warnings ?? [];
    this.code = details?.code;
    this.blocking = details?.blocking;
  }
}

type AdminActionErrorJson = {
  error?: string;
  code?: string;
  blocking?: boolean;
  warnings?: AdminWarning[];
};

function adminActionError(json: AdminActionErrorJson, fallback: string): AdminDashboardActionError {
  return new AdminDashboardActionError(json.error ?? fallback, {
    warnings: Array.isArray(json.warnings) ? json.warnings : [],
    code: json.code,
    blocking: json.blocking,
  });
}

async function getAdminToken(): Promise<string> {
  try {
    const sb = getSupabaseBrowser();
    const session = await sb?.auth.getSession();
    const token = session?.data.session?.access_token;
    if (!token) throw new Error("Please sign in as an admin.");
    return token;
  } catch (e) {
    if (e instanceof Error && e.message === "Please sign in as an admin.") throw e;
    throw new Error("Could not read admin session. Check your connection and try again.");
  }
}

export async function fetchBookings(filter: "all" | "today" | "upcoming" | "completed" = "all") {
  const token = await getAdminToken();
  const q = filter === "all" ? "" : `?filter=${encodeURIComponent(filter)}`;
  const res = await fetch(`/api/admin/bookings${q}`, { headers: { Authorization: `Bearer ${token}` } });
  const json = (await res.json()) as { bookings?: AdminBookingRow[]; error?: string };
  if (!res.ok) throw new Error(json.error ?? "Failed to fetch bookings.");
  return json.bookings ?? [];
}

export async function fetchCleaners(search?: string) {
  const token = await getAdminToken();
  const q =
    search !== undefined && search.trim() !== ""
      ? `?search=${encodeURIComponent(search.trim())}`
      : "";
  const res = await fetch(`/api/admin/cleaners${q}`, { headers: { Authorization: `Bearer ${token}` } });
  const json = (await res.json()) as { cleaners?: AdminCleanerRow[]; error?: string };
  if (!res.ok) throw new Error(json.error ?? "Failed to fetch cleaners.");
  return json.cleaners ?? [];
}

export type AdminCleanerChangeRequest = {
  id: string;
  cleaner_id: string;
  cleaner_name: string;
  current_location: string;
  current_days: string[];
  requested_locations: string[];
  requested_days: string[];
  note: string | null;
  created_at: string;
  status: string;
};

export async function fetchPendingCleanerChangeRequests(): Promise<AdminCleanerChangeRequest[]> {
  const token = await getAdminToken();
  const res = await fetch("/api/admin/cleaner-change-requests", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = (await res.json()) as { requests?: AdminCleanerChangeRequest[]; error?: string };
  if (!res.ok) throw new Error(json.error ?? "Failed to fetch change requests.");
  return json.requests ?? [];
}

export async function approveCleanerChangeRequest(requestId: string): Promise<void> {
  const token = await getAdminToken();
  const res = await fetch(`/api/admin/cleaner-change-requests/${encodeURIComponent(requestId)}/approve`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = (await res.json()) as { error?: string };
  if (!res.ok) throw new Error(json.error ?? "Approve failed.");
}

export async function rejectCleanerChangeRequest(requestId: string): Promise<void> {
  const token = await getAdminToken();
  const res = await fetch(`/api/admin/cleaner-change-requests/${encodeURIComponent(requestId)}/reject`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = (await res.json()) as { error?: string };
  if (!res.ok) throw new Error(json.error ?? "Reject failed.");
}

/** Cleaners for “add to team” picker: optional search, excludes current roster, capped server-side. */
export async function fetchAdminCleanersForTeamAdd(opts: {
  excludeTeamId: string;
  search?: string;
  limit?: number;
  /** Omit or `available` (is_available) | `high_rated` (rating ≥ 4). */
  filter?: "available" | "high_rated";
}): Promise<AdminCleanerRow[]> {
  const token = await getAdminToken();
  const params = new URLSearchParams();
  params.set("excludeTeamId", opts.excludeTeamId.trim());
  const s = opts.search?.trim();
  if (s) params.set("search", s);
  if (opts.limit != null) params.set("limit", String(Math.min(200, Math.max(1, opts.limit))));
  const f = opts.filter ?? "all";
  if (f !== "all") params.set("filter", f);
  const res = await fetch(`/api/admin/cleaners?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = (await res.json()) as { cleaners?: AdminCleanerRow[]; error?: string };
  if (!res.ok) throw new Error(json.error ?? "Failed to fetch cleaners.");
  return json.cleaners ?? [];
}

/** Matches `GET /api/admin/teams` row shape (extends minimal `Team` with dispatch fields). */
export type AdminTeamRow = {
  id: string;
  name: string;
  capacity_per_day: number;
  service_type: string;
  is_active: boolean | null;
  created_at?: string | null;
  lead_cleaner_id?: string | null;
  /** Roster size (rows in team_members with non-null cleaner_id). */
  member_count?: number;
};

export type AdminTeamMemberRow = {
  cleaner_id: string;
  name: string;
  phone: string | null;
  joined_at: string | null;
  /** From joined `cleaners` row for ops UI. */
  rating?: number | null;
  jobs_completed?: number | null;
  is_available?: boolean | null;
  status?: string | null;
};

export async function fetchAdminTeams(): Promise<AdminTeamRow[]> {
  const token = await getAdminToken();
  const res = await fetch("/api/admin/teams", { headers: { Authorization: `Bearer ${token}` } });
  const json = (await res.json()) as { teams?: AdminTeamRow[]; error?: string };
  if (res.status === 401) throw new Error("Please login.");
  if (res.status === 403) throw new Error("Admin access required.");
  if (!res.ok) throw new Error(json.error ?? "Failed to fetch teams.");
  return json.teams ?? [];
}

export async function createAdminTeam(payload: {
  name: string;
  capacity_per_day: number;
  service_type: "deep_cleaning" | "move_cleaning";
  is_active?: boolean;
}): Promise<AdminTeamRow> {
  const token = await getAdminToken();
  const res = await fetch("/api/admin/teams", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = (await res.json()) as { ok?: boolean; team?: AdminTeamRow; error?: string };
  if (res.status === 401) throw new Error("Please login.");
  if (res.status === 403) throw new Error("Admin access required.");
  if (!res.ok) throw new Error(json.error ?? "Failed to create team.");
  if (!json.team) throw new Error("Team created but response was incomplete.");
  return json.team;
}

const TEAM_BUSY_MESSAGE = "Team is busy, try again.";

export async function fetchAdminTeamMembers(
  teamId: string,
  opts?: { limit?: number; offset?: number },
): Promise<AdminTeamMemberRow[]> {
  const token = await getAdminToken();
  const params = new URLSearchParams();
  if (opts?.limit != null) {
    params.set("limit", String(opts.limit));
    params.set("offset", String(opts.offset ?? 0));
  }
  const q = params.toString();
  const url = `/api/admin/teams/${encodeURIComponent(teamId)}/members${q ? `?${q}` : ""}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const json = (await res.json()) as { members?: AdminTeamMemberRow[]; error?: string };
  if (res.status === 401) throw new Error("Please login.");
  if (res.status === 403) throw new Error("Admin access required.");
  if (!res.ok) throw new Error(json.error ?? "Failed to fetch team members.");
  return Array.isArray(json.members) ? json.members : [];
}

export async function addAdminTeamMembers(
  teamId: string,
  cleanerIds: string[],
  opts?: { idempotencyKey?: string },
): Promise<number> {
  const token = await getAdminToken();
  const url = `/api/admin/teams/${encodeURIComponent(teamId)}/members`;
  const idem = opts?.idempotencyKey?.trim();
  const baseHeaders: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  if (idem && idem.length <= 128) {
    baseHeaders["Idempotency-Key"] = idem;
  }

  const postOnce = async (retryAfterBusy: boolean) => {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        ...baseHeaders,
        ...(retryAfterBusy ? { "X-Shalean-Retry-After-Busy": "1" } : {}),
      },
      body: JSON.stringify({ cleanerIds }),
    });
    const json = (await res.json()) as {
      ok?: boolean;
      inserted?: number;
      error?: string;
      code?: string;
      skippedDuplicates?: number;
    };
    return { res, json };
  };

  let { res, json } = await postOnce(false);
  const busyByCode = res.status === 409 && json.code === TEAM_MEMBER_ADD_CODE.TEAM_BUSY;
  const busyLegacy = res.status === 409 && json.error === TEAM_BUSY_MESSAGE;
  if (busyByCode || busyLegacy) {
    await new Promise((r) => setTimeout(r, 80 + Math.random() * 80));
    ({ res, json } = await postOnce(true));
  }

  if (res.status === 401) throw new Error("Please login.");
  if (res.status === 403) throw new Error("Admin access required.");
  if (res.status === 409) throw new Error(json.error ?? "Exceeds team capacity.");
  if (!res.ok) throw new Error(json.error ?? "Failed to add team members.");
  return typeof json.inserted === "number" ? json.inserted : 0;
}

const TEAM_ADD_CHUNK = 20;

/** POST allows at most 20 IDs per request; splits larger batches with fresh idempotency keys. */
export async function addAdminTeamMembersBatched(teamId: string, cleanerIds: string[]): Promise<number> {
  const unique = [...new Set(cleanerIds.map((id) => id.trim()).filter(Boolean))];
  let total = 0;
  for (let i = 0; i < unique.length; i += TEAM_ADD_CHUNK) {
    const chunk = unique.slice(i, i + TEAM_ADD_CHUNK);
    const idempotencyKey =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    total += await addAdminTeamMembers(teamId, chunk, { idempotencyKey });
  }
  return total;
}

export async function removeAdminTeamMember(teamId: string, cleanerId: string): Promise<void> {
  const token = await getAdminToken();
  const res = await fetch(`/api/admin/teams/${encodeURIComponent(teamId)}/members`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ cleanerId }),
  });
  const json = (await res.json()) as { error?: string };
  if (res.status === 401) throw new Error("Please login.");
  if (res.status === 403) throw new Error("Admin access required.");
  if (!res.ok) throw new Error(json.error ?? "Failed to remove team member.");
}

export async function deleteAdminTeam(teamId: string): Promise<void> {
  const token = await getAdminToken();
  const res = await fetch("/api/admin/teams", {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ teamId }),
  });
  const json = (await res.json()) as { ok?: boolean; error?: string };
  if (res.status === 401) throw new Error("Please login.");
  if (res.status === 403) throw new Error("Admin access required.");
  if (!res.ok) throw new Error(json.error ?? "Failed to delete team.");
}

export async function patchAdminTeam(
  teamId: string,
  patch: {
    name?: string;
    is_active?: boolean;
    capacity_per_day?: number;
    service_type?: "deep_cleaning" | "move_cleaning";
    lead_cleaner_id?: string;
  },
): Promise<AdminTeamRow> {
  const token = await getAdminToken();
  const res = await fetch(`/api/admin/teams/${encodeURIComponent(teamId)}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  const json = (await res.json()) as { ok?: boolean; team?: AdminTeamRow; error?: string };
  if (res.status === 401) throw new Error("Please login.");
  if (res.status === 403) throw new Error("Admin access required.");
  if (!res.ok) throw new Error(json.error ?? "Failed to update team.");
  if (!json.team) throw new Error("Update response incomplete.");
  return json.team;
}

/** Appoint team lead after roster is built (drives payout owner on team job assignment). */
export async function setAdminTeamLead(teamId: string, cleanerId: string): Promise<AdminTeamRow> {
  return patchAdminTeam(teamId, { lead_cleaner_id: cleanerId });
}

/** @deprecated Use {@link patchAdminTeam} */
export async function patchAdminTeamIsActive(teamId: string, is_active: boolean): Promise<AdminTeamRow> {
  return patchAdminTeam(teamId, { is_active });
}

export async function fetchCustomers() {
  const token = await getAdminToken();
  const res = await fetch("/api/admin/customers", { headers: { Authorization: `Bearer ${token}` } });
  const json = (await res.json()) as { customers?: AdminCustomerRow[]; error?: string };
  if (!res.ok) throw new Error(json.error ?? "Failed to fetch customers.");
  return json.customers ?? [];
}

export async function assignCleaner(bookingId: string, cleanerId: string, force = false) {
  const token = await getAdminToken();
  const res = await fetch(`/api/admin/bookings/${encodeURIComponent(bookingId)}/offer`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ cleanerId, force }),
  });
  const json = (await res.json()) as AdminActionErrorJson;
  if (!res.ok) throw adminActionError(json, "Failed to assign cleaner.");
}

export type AdminTeamAssignCandidate = {
  id: string;
  name: string;
  capacity_per_day: number;
  member_count: number;
  active_member_count?: number;
  qualified_member_count?: number;
  used_slots_today: number;
  remaining_slots_today: number;
  assignable: boolean;
  assign_block_reason?: string | null;
  team_active?: boolean;
};

export async function fetchTeamAssignCandidates(bookingId: string): Promise<{
  teams: AdminTeamAssignCandidate[];
  qualified_for_label: string;
  supports_team_assignment: boolean;
  earnings_finalized: boolean;
}> {
  const token = await getAdminToken();
  const res = await fetch(`/api/admin/bookings/${encodeURIComponent(bookingId)}/assign-team`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = (await res.json()) as {
    teams?: AdminTeamAssignCandidate[];
    qualified_for_label?: string;
    supports_team_assignment?: boolean;
    earnings_finalized?: boolean;
    error?: string;
  };
  if (res.status === 401) throw new Error("Please login.");
  if (res.status === 403) throw new Error("Admin access required.");
  if (!res.ok) throw new Error(json.error ?? "Failed to load teams.");
  return {
    teams: json.teams ?? [],
    qualified_for_label: json.qualified_for_label ?? "",
    supports_team_assignment: json.supports_team_assignment === true,
    earnings_finalized: json.earnings_finalized === true,
  };
}

export async function assignTeamToBookingAdmin(bookingId: string, teamId: string, opts?: { force?: boolean }) {
  const token = await getAdminToken();
  const res = await fetch(`/api/admin/bookings/${encodeURIComponent(bookingId)}/assign-team`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ teamId, ...(opts?.force === true ? { force: true } : {}) }),
  });
  const json = (await res.json()) as {
    error?: string;
    hint?: string;
    force_hint?: string;
    code?: string;
  };
  if (!res.ok) {
    if (json.code === "roster_finalized" || (res.status === 409 && json.hint)) {
      const parts = [json.hint ?? json.error ?? "Failed to assign team."];
      if (json.force_hint) parts.push(json.force_hint);
      throw new Error(parts.join(" "));
    }
    throw new Error(json.error ?? "Failed to assign team.");
  }
}

export async function updateBookingStatus(id: string, status: string) {
  const token = await getAdminToken();
  const res = await fetch(`/api/admin/bookings/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  const json = (await res.json()) as AdminActionErrorJson;
  if (!res.ok) throw adminActionError(json, "Failed to update booking status.");
}

export async function changeBookingStatusAdmin(id: string, status: string, reason: string) {
  const token = await getAdminToken();
  const res = await fetch(`/api/admin/bookings/${encodeURIComponent(id)}/change-status`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ status, reason }),
  });
  const json = (await res.json()) as AdminActionErrorJson;
  if (!res.ok) throw adminActionError(json, "Failed to change booking status.");
}

export async function updateBooking(id: string, patch: { date?: string; time?: string; status?: string }) {
  const token = await getAdminToken();
  const res = await fetch(`/api/admin/bookings/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  const json = (await res.json()) as AdminActionErrorJson;
  if (!res.ok) throw adminActionError(json, "Failed to update booking.");
}

export async function deleteBookingAdmin(bookingId: string) {
  const token = await getAdminToken();
  const res = await fetch(`/api/admin/bookings/${encodeURIComponent(bookingId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = (await res.json()) as AdminActionErrorJson;
  if (!res.ok) throw adminActionError(json, "Failed to delete booking.");
}

export async function updateCleanerStatus(id: string, status: "available" | "busy" | "offline") {
  const token = await getAdminToken();
  const res = await fetch(`/api/admin/cleaners/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  const json = (await res.json()) as { error?: string };
  if (!res.ok) throw new Error(json.error ?? "Failed to update cleaner status.");
}

export async function createAdminCleaner(payload: {
  fullName: string;
  phone: string;
  email?: string;
  password: string;
  cityId?: string | null;
  location?: string;
  availabilityStart?: string | null;
  availabilityEnd?: string | null;
  isAvailable?: boolean;
}) {
  const token = await getAdminToken();
  const res = await fetch("/api/admin/create-cleaner", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = (await res.json()) as { error?: string; cleanerId?: string };
  if (!res.ok) throw new Error(json.error ?? "Failed to create cleaner.");
  return json;
}

export type AdminCleanerPreferencesResponse = {
  preferences: {
    cleaner_id: string;
    preferred_areas: string[];
    preferred_services: string[];
    preferred_time_blocks: PreferredTimeBlock[];
    is_strict: boolean;
    updated_at?: string | null;
  } | null;
  locationOptions: { id: string; name: string; slug: string | null }[];
  serviceOptions: { slug: string; label: string }[];
  /** From `cleaner_locations` — authoritative service areas. */
  assignedLocationIds: string[];
};

export async function fetchAdminCleanerPreferences(cleanerId: string): Promise<AdminCleanerPreferencesResponse> {
  const token = await getAdminToken();
  const res = await fetch(`/api/admin/cleaners/${encodeURIComponent(cleanerId)}/preferences`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = (await res.json()) as AdminCleanerPreferencesResponse & { error?: string };
  if (res.status === 401) throw new Error("Please sign in as an admin.");
  if (res.status === 403) throw new Error("Admin access required.");
  if (!res.ok) throw new Error(json.error ?? "Failed to load preferences.");
  return {
    preferences: json.preferences ?? null,
    locationOptions: json.locationOptions ?? [],
    serviceOptions: json.serviceOptions ?? [],
    assignedLocationIds: json.assignedLocationIds ?? [],
  };
}

export async function saveAdminCleanerWeeklyAvailability(
  cleanerId: string,
  payload: { weeklySchedule: { day: number; start: string; end: string }[]; horizonDays?: number },
): Promise<{ inserted: number }> {
  const token = await getAdminToken();
  const res = await fetch(`/api/admin/cleaners/${encodeURIComponent(cleanerId)}/availability`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = (await res.json()) as { ok?: boolean; inserted?: number; error?: string };
  if (res.status === 401) throw new Error("Please sign in as an admin.");
  if (res.status === 403) throw new Error("Admin access required.");
  if (!res.ok) throw new Error(json.error ?? "Failed to save availability.");
  return { inserted: json.inserted ?? 0 };
}

export async function saveAdminCleanerLocationIds(cleanerId: string, locationIds: string[]): Promise<{ count: number }> {
  const token = await getAdminToken();
  const res = await fetch(`/api/admin/cleaners/${encodeURIComponent(cleanerId)}/locations`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ locationIds }),
  });
  const json = (await res.json()) as { ok?: boolean; count?: number; error?: string };
  if (res.status === 401) throw new Error("Please sign in as an admin.");
  if (res.status === 403) throw new Error("Admin access required.");
  if (!res.ok) throw new Error(json.error ?? "Failed to save locations.");
  return { count: json.count ?? 0 };
}

export async function saveAdminCleanerPreferences(
  cleanerId: string,
  payload: CleanerPreferencesPayload,
): Promise<AdminCleanerPreferencesResponse["preferences"]> {
  const token = await getAdminToken();
  const res = await fetch(`/api/admin/cleaners/${encodeURIComponent(cleanerId)}/preferences`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = (await res.json()) as { ok?: boolean; preferences?: AdminCleanerPreferencesResponse["preferences"]; error?: string };
  if (res.status === 401) throw new Error("Please sign in as an admin.");
  if (res.status === 403) throw new Error("Admin access required.");
  if (!res.ok) throw new Error(json.error ?? "Failed to save preferences.");
  if (!json.preferences) throw new Error("Save succeeded but response was incomplete.");
  return json.preferences;
}

export async function updateCleanerProfile(
  id: string,
  patch: {
    full_name?: string;
    phone?: string;
    location?: string | null;
    availability_start?: string | null;
    availability_end?: string | null;
    is_available?: boolean;
    is_active?: boolean;
    status?: "available" | "busy" | "offline";
    availability_weekdays?: string[];
    /** Canonical tenure anchor for payout tier (admin Office panel). */
    joined_at?: string | null;
  },
) {
  const token = await getAdminToken();
  const res = await fetch(`/api/admin/cleaners/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  const json = (await res.json()) as { error?: string };
  if (!res.ok) throw new Error(json.error ?? "Failed to update cleaner.");
}

/** Syncs `auth.users.email` and `public.cleaners.email` (never update email via PATCH alone). */
export async function updateCleanerEmail(cleanerId: string, newEmail: string) {
  const token = await getAdminToken();
  const res = await fetch("/api/admin/update-cleaner-email", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ cleanerId, newEmail }),
  });
  const json = (await res.json()) as { error?: string };
  if (!res.ok) throw new Error(json.error ?? "Failed to update cleaner email.");
}

export async function resetCleanerPassword(id: string, password: string) {
  const token = await getAdminToken();
  const res = await fetch("/api/admin/reset-cleaner-password", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ cleanerId: id, password }),
  });
  const json = (await res.json()) as { error?: string };
  if (!res.ok) throw new Error(json.error ?? "Failed to reset cleaner password.");
}

/** Admin-only: returns a one-time Supabase recovery `action_link` for the cleaner's email. */
export async function requestCleanerRecoveryLink(cleanerId: string): Promise<string> {
  const token = await getAdminToken();
  const res = await fetch(`/api/admin/cleaners/${encodeURIComponent(cleanerId)}/recovery-link`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = (await res.json()) as { error?: string; actionLink?: string };
  if (!res.ok) throw new Error(json.error ?? "Failed to generate recovery link.");
  return json.actionLink ?? "";
}

export async function runCleanerAuthBackfill(): Promise<CleanerAuthBackfillResult> {
  const token = await getAdminToken();
  const res = await fetch("/api/admin/cleaners/backfill-auth", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = (await res.json()) as { result?: CleanerAuthBackfillResult; error?: string };
  if (!res.ok) throw new Error(json.error ?? "Auth backfill failed.");
  return (
    json.result ?? {
      scanned: 0,
      missingAuth: 0,
      linked: 0,
      failed: 0,
      failures: [],
    }
  );
}
