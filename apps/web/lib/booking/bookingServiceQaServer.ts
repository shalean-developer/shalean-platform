import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanerHasBookingAccess } from "@/lib/cleaner/cleanerBookingAccess";
import { resolveCleanerIdFromRequest } from "@/lib/cleaner/session";
import {
  resolveBookingServiceQaProfile,
  sectionLabelForQaKey,
  type BookingServiceQaProfile,
  type ServiceQaAdminWire,
  type ServiceQaCleanerWire,
} from "@/lib/booking/bookingServiceQa";

const PHOTO_BUCKET = "booking-service-photos";
const SIGNED_URL_TTL_SEC = 3600;

export type ChecklistRowDb = {
  id: string;
  booking_id: string;
  cleaner_id: string;
  section_key: string;
  completed: boolean;
  completed_at: string | null;
  notes: string | null;
  created_at: string;
};

export type PhotoRowDb = {
  id: string;
  booking_id: string;
  cleaner_id: string;
  section_key: string;
  photo_type: string;
  storage_path: string;
  created_at: string;
};

function labelsForProfile(profile: BookingServiceQaProfile): Record<string, string> {
  const o: Record<string, string> = {};
  for (const k of profile.sections) {
    o[k] = sectionLabelForQaKey(k);
  }
  return o;
}

async function signStoragePaths(
  admin: SupabaseClient,
  paths: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = [...new Set(paths.map((p) => String(p ?? "").trim()).filter(Boolean))];
  await Promise.all(
    unique.map(async (path) => {
      const { data, error } = await admin.storage.from(PHOTO_BUCKET).createSignedUrl(path, SIGNED_URL_TTL_SEC);
      if (!error && data?.signedUrl) out.set(path, data.signedUrl);
    }),
  );
  return out;
}

export function bookingStatusAllowsServiceQaMutation(status: string | null | undefined): boolean {
  const s = String(status ?? "").trim().toLowerCase();
  return !["cancelled", "failed", "payment_expired"].includes(s);
}

export async function fetchServiceQaForCleanerJob(
  admin: SupabaseClient,
  params: {
    bookingId: string;
    cleanerId: string;
    serviceSlug: string | null;
    serviceLabel: string | null;
  },
): Promise<ServiceQaCleanerWire | null> {
  const profile = resolveBookingServiceQaProfile(params.serviceSlug, params.serviceLabel);
  if (!profile) return null;

  const [{ data: checklistRows }, { data: photoRows }] = await Promise.all([
    admin
      .from("booking_service_checklists")
      .select("id, booking_id, cleaner_id, section_key, completed, completed_at, notes, created_at")
      .eq("booking_id", params.bookingId)
      .eq("cleaner_id", params.cleanerId),
    admin
      .from("booking_service_photos")
      .select("id, booking_id, cleaner_id, section_key, photo_type, storage_path, created_at")
      .eq("booking_id", params.bookingId)
      .order("created_at", { ascending: true }),
  ]);

  const bySection = new Map<string, ChecklistRowDb>();
  for (const raw of checklistRows ?? []) {
    const r = raw as ChecklistRowDb;
    bySection.set(String(r.section_key).trim(), r);
  }

  const checklist = profile.sections.map((section_key) => {
    const row = bySection.get(section_key);
    return {
      section_key,
      completed: row?.completed === true,
      completed_at: row?.completed_at ?? null,
      notes: row?.notes ?? null,
    };
  });

  const photosDb = (photoRows ?? []) as PhotoRowDb[];
  const pathMap = await signStoragePaths(
    admin,
    photosDb.map((p) => p.storage_path),
  );

  const photos = photosDb.map((p) => ({
    id: p.id,
    cleaner_id: p.cleaner_id,
    section_key: p.section_key,
    section_label: sectionLabelForQaKey(p.section_key),
    photo_type: String(p.photo_type ?? "").trim().toLowerCase(),
    signed_url: pathMap.get(p.storage_path) ?? null,
    created_at: p.created_at,
  }));

  return {
    sections: [...profile.sections],
    section_labels: labelsForProfile(profile),
    checklist,
    photos,
  };
}

async function cleanerNamesById(
  admin: SupabaseClient,
  ids: readonly string[],
): Promise<Map<string, string | null>> {
  const uniq = [...new Set(ids.map((x) => String(x ?? "").trim()).filter(Boolean))];
  const map = new Map<string, string | null>();
  if (!uniq.length) return map;
  const { data, error } = await admin.from("cleaners").select("id, full_name").in("id", uniq);
  if (error) return map;
  for (const raw of data ?? []) {
    const r = raw as { id?: string; full_name?: string | null };
    if (r.id) map.set(String(r.id), r.full_name ?? null);
  }
  return map;
}

export async function fetchServiceQaForAdminBooking(
  admin: SupabaseClient,
  params: { bookingId: string; serviceSlug: string | null; serviceLabel: string | null },
): Promise<ServiceQaAdminWire | null> {
  const profile = resolveBookingServiceQaProfile(params.serviceSlug, params.serviceLabel);
  if (!profile) return null;

  const [{ data: checklistRows }, { data: photoRows }] = await Promise.all([
    admin
      .from("booking_service_checklists")
      .select("cleaner_id, section_key, completed, completed_at, notes")
      .eq("booking_id", params.bookingId),
    admin
      .from("booking_service_photos")
      .select("id, cleaner_id, section_key, photo_type, storage_path, created_at")
      .eq("booking_id", params.bookingId)
      .order("created_at", { ascending: true }),
  ]);

  const checklistRaw = (checklistRows ?? []) as Array<{
    cleaner_id: string;
    section_key: string;
    completed: boolean;
    completed_at: string | null;
    notes: string | null;
  }>;
  const photosDb = (photoRows ?? []) as PhotoRowDb[];

  const nameIds = [
    ...checklistRaw.map((r) => r.cleaner_id),
    ...photosDb.map((p) => p.cleaner_id),
  ];
  const names = await cleanerNamesById(admin, nameIds);

  const checklist = checklistRaw.map((r) => {
    const sk = String(r.section_key).trim();
    return {
      cleaner_id: String(r.cleaner_id),
      cleaner_name: names.get(String(r.cleaner_id)) ?? null,
      section_key: sk,
      section_label: sectionLabelForQaKey(sk),
      completed: r.completed === true,
      completed_at: r.completed_at ?? null,
      notes: r.notes ?? null,
    };
  });

  const pathMap = await signStoragePaths(
    admin,
    photosDb.map((p) => p.storage_path),
  );

  const photos = photosDb.map((p) => ({
    id: p.id,
    cleaner_id: p.cleaner_id,
    cleaner_name: names.get(String(p.cleaner_id)) ?? null,
    section_key: p.section_key,
    section_label: sectionLabelForQaKey(p.section_key),
    photo_type: String(p.photo_type ?? "").trim().toLowerCase(),
    signed_url: pathMap.get(p.storage_path) ?? null,
    created_at: p.created_at,
  }));

  return {
    sections: [...profile.sections],
    section_labels: labelsForProfile(profile),
    checklist,
    photos,
  };
}

export async function resolveCleanerBookingForQa(
  admin: SupabaseClient,
  request: Request,
  bookingId: string,
): Promise<
  | {
      ok: true;
      cleanerId: string;
      booking: {
        status: string | null;
        service_slug: string | null;
        service: string | null;
        cleaner_id: string | null;
        payout_owner_cleaner_id: string | null;
        team_id: string | null;
        is_team_job: boolean;
      };
      profile: BookingServiceQaProfile;
    }
  | { ok: false; status: number; error: string }
> {
  const session = await resolveCleanerIdFromRequest(request, admin);
  if (!session.cleanerId) {
    return { ok: false, status: session.status ?? 401, error: session.error ?? "Unauthorized." };
  }

  const { data: row, error } = await admin
    .from("bookings")
    .select("status, service_slug, service, cleaner_id, payout_owner_cleaner_id, team_id, is_team_job")
    .eq("id", bookingId)
    .maybeSingle();

  if (error) return { ok: false, status: 500, error: error.message };
  if (!row) return { ok: false, status: 404, error: "Booking not found." };

  const record = row as Record<string, unknown>;
  const canAccess = await cleanerHasBookingAccess(admin, session.cleanerId, {
    id: bookingId,
    cleaner_id: (record.cleaner_id as string | null | undefined) ?? null,
    payout_owner_cleaner_id: (record.payout_owner_cleaner_id as string | null | undefined) ?? null,
    team_id: (record.team_id as string | null | undefined) ?? null,
    is_team_job: record.is_team_job === true,
  });
  if (!canAccess) return { ok: false, status: 404, error: "Booking not found." };

  const serviceSlug = typeof record.service_slug === "string" ? record.service_slug : null;
  const service = typeof record.service === "string" ? record.service : null;
  const profile = resolveBookingServiceQaProfile(serviceSlug, service);
  if (!profile) {
    return { ok: false, status: 400, error: "Service QA checklist is only available for deep and move cleaning jobs." };
  }

  return {
    ok: true,
    cleanerId: session.cleanerId,
    booking: {
      status: record.status as string | null,
      service_slug: serviceSlug,
      service,
      cleaner_id: (record.cleaner_id as string | null) ?? null,
      payout_owner_cleaner_id: (record.payout_owner_cleaner_id as string | null) ?? null,
      team_id: (record.team_id as string | null) ?? null,
      is_team_job: record.is_team_job === true,
    },
    profile,
  };
}

export { PHOTO_BUCKET };
