"use client";

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
