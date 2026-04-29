"use client";

import { TEAM_MEMBER_ADD_CODE } from "./teamMemberAddCodes";
import type { CleanerPreferencesPayload, PreferredTimeBlock } from "@/lib/cleaner/cleanerPreferencesTypes";
import { getSupabaseBrowser } from "@/lib/supabase/browser";

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
  home_lat?: number | null;
  home_lng?: number | null;
  email?: string | null;
  status?: string | null;
  city_id?: string | null;
  location?: string | null;
  availability_start?: string | null;
  availability_end?: string | null;
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

async function getAdminToken(): Promise<string> {
  const sb = getSupabaseBrowser();
  const session = await sb?.auth.getSession();
  const token = session?.data.session?.access_token;
  if (!token) throw new Error("Please sign in as an admin.");
  return token;
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

/** Matches `GET /api/admin/teams` row shape (extends minimal `Team` with dispatch fields). */
export type AdminTeamRow = {
  id: string;
  name: string;
  capacity_per_day: number;
  service_type: string;
  is_active: boolean | null;
  created_at?: string | null;
  /** Roster size (rows in team_members with non-null cleaner_id). */
  member_count?: number;
};

export type AdminTeamMemberRow = {
  cleaner_id: string;
  name: string;
  phone: string | null;
  joined_at: string | null;
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

export async function patchAdminTeamIsActive(teamId: string, is_active: boolean): Promise<AdminTeamRow> {
  const token = await getAdminToken();
  const res = await fetch(`/api/admin/teams/${encodeURIComponent(teamId)}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ is_active }),
  });
  const json = (await res.json()) as { ok?: boolean; team?: AdminTeamRow; error?: string };
  if (res.status === 401) throw new Error("Please login.");
  if (res.status === 403) throw new Error("Admin access required.");
  if (!res.ok) throw new Error(json.error ?? "Failed to update team.");
  if (!json.team) throw new Error("Update response incomplete.");
  return json.team;
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
  const res = await fetch(`/api/admin/bookings/${encodeURIComponent(bookingId)}/assign`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ cleanerId, force }),
  });
  const json = (await res.json()) as { error?: string };
  if (!res.ok) throw new Error(json.error ?? "Failed to assign cleaner.");
}

export async function assignTeamToBookingAdmin(bookingId: string, teamId: string) {
  const token = await getAdminToken();
  const res = await fetch(`/api/admin/bookings/${encodeURIComponent(bookingId)}/assign-team`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ teamId }),
  });
  const json = (await res.json()) as { error?: string };
  if (!res.ok) throw new Error(json.error ?? "Failed to assign team.");
}

export async function updateBookingStatus(id: string, status: string) {
  const token = await getAdminToken();
  const res = await fetch(`/api/admin/bookings/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  const json = (await res.json()) as { error?: string };
  if (!res.ok) throw new Error(json.error ?? "Failed to update booking status.");
}

export async function updateBooking(id: string, patch: { date?: string; time?: string; status?: string }) {
  const token = await getAdminToken();
  const res = await fetch(`/api/admin/bookings/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  const json = (await res.json()) as { error?: string };
  if (!res.ok) throw new Error(json.error ?? "Failed to update booking.");
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
    status?: "available" | "busy" | "offline";
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
