/**
 * Pure helpers for deep/move team-service detection. Safe for Client Components — no DB or server-only imports.
 */

import { parseBookingServiceId } from "@/components/booking/serviceCategories";

export type TeamBookingServiceRef = {
  service?: string | null;
  /** Persisted catalog slug (`deep`, `move`, …) — most reliable for admin assign-team matching. */
  service_slug?: string | null;
  booking_snapshot?: unknown;
};

function parseServiceIdFromSlugField(raw: string | null | undefined): ReturnType<typeof parseBookingServiceId> {
  if (raw == null || !String(raw).trim()) return null;
  return parseBookingServiceId(String(raw).trim());
}

/** True when label or snapshot indicates move (move-in/out), not arbitrary substring "move". */
function displayServiceLooksLikeMove(serviceLabelLower: string): boolean {
  if (!serviceLabelLower) return false;
  return (
    /\bmove\b/.test(serviceLabelLower) ||
    serviceLabelLower.includes("move-in") ||
    serviceLabelLower.includes("move in") ||
    serviceLabelLower.includes("move/out") ||
    serviceLabelLower.includes("move out") ||
    serviceLabelLower.includes("in/out")
  );
}

export function isTeamService(booking: TeamBookingServiceRef): boolean {
  const fromCol = parseServiceIdFromSlugField(booking.service_slug ?? null);
  if (fromCol === "deep" || fromCol === "move") return true;

  const snap = booking.booking_snapshot;
  if (snap && typeof snap === "object" && !Array.isArray(snap)) {
    const locked = (snap as { locked?: unknown }).locked;
    if (locked && typeof locked === "object" && !Array.isArray(locked)) {
      const sid = parseBookingServiceId((locked as { service?: unknown }).service);
      if (sid === "deep" || sid === "move") return true;
    }
    for (const rawSlug of [
      (snap as { service_slug?: unknown }).service_slug,
      (snap as { serviceSlug?: unknown }).serviceSlug,
    ]) {
      const fromSnap = typeof rawSlug === "string" ? parseBookingServiceId(rawSlug) : null;
      if (fromSnap === "deep" || fromSnap === "move") return true;
    }
  }

  const s = String(booking.service ?? "").toLowerCase();
  return s.includes("deep") || displayServiceLooksLikeMove(s);
}

/**
 * Which team bucket this booking uses (`teams.service_type` deep vs move).
 * Prefer `service_slug` and snapshot `locked.service` so we don't mis-classify deep jobs
 * when the display label accidentally contains "move".
 */
export function teamServiceType(booking: TeamBookingServiceRef): "deep_cleaning" | "move_cleaning" {
  const fromCol = parseServiceIdFromSlugField(booking.service_slug ?? null);
  if (fromCol === "move") return "move_cleaning";
  if (fromCol === "deep") return "deep_cleaning";

  const snap = booking.booking_snapshot;
  if (snap && typeof snap === "object" && !Array.isArray(snap)) {
    const locked = (snap as { locked?: unknown }).locked;
    if (locked && typeof locked === "object" && !Array.isArray(locked)) {
      const sid = parseBookingServiceId((locked as { service?: unknown }).service);
      if (sid === "move") return "move_cleaning";
      if (sid === "deep") return "deep_cleaning";
    }
    for (const rawSlug of [
      (snap as { service_slug?: unknown }).service_slug,
      (snap as { serviceSlug?: unknown }).serviceSlug,
    ]) {
      const fromSnap = typeof rawSlug === "string" ? parseBookingServiceId(rawSlug) : null;
      if (fromSnap === "move") return "move_cleaning";
      if (fromSnap === "deep") return "deep_cleaning";
    }
  }

  const s = String(booking.service ?? "").toLowerCase();
  return displayServiceLooksLikeMove(s) ? "move_cleaning" : "deep_cleaning";
}
