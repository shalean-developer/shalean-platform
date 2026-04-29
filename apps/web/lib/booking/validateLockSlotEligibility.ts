import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { useStrictAvailability } from "@/lib/booking/availabilityFlags";
import { countEligibleCleaners } from "@/lib/booking/getEligibleCleaners";

/**
 * Ensures a lock request matches server-side eligibility for the given area and slot
 * (prevents stale locks after suburb change or DevTools tampering with `cleanersCount` / `locationId`).
 */
export async function validateLockSlotAgainstEligibility(
  admin: SupabaseClient,
  body: Record<string, unknown>,
  opts: { timeHm: string; durationHours: number },
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const strict = useStrictAvailability();
  const loc = String(body.locationId ?? body.location_id ?? "").trim();
  const date = typeof body.date === "string" ? body.date.trim() : "";

  if (!loc) {
    if (strict) {
      return { ok: false, status: 400, error: "locationId is required to lock a slot." };
    }
    return { ok: true };
  }

  if (!/^[0-9a-f-]{36}$/i.test(loc)) {
    return { ok: false, status: 400, error: "Invalid locationId." };
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { ok: false, status: 400, error: "date is required (YYYY-MM-DD) when locking with an area." };
  }

  const slotLoc = String(body.slotLocationId ?? body.slot_location_id ?? "").trim();
  if (slotLoc && slotLoc.toLowerCase() !== loc.toLowerCase()) {
    return {
      ok: false,
      status: 409,
      error: "Selected time does not match the chosen area. Refresh times and try again.",
    };
  }

  const durationMinutes = Math.max(30, Math.round(opts.durationHours * 60));
  const serverCount = await countEligibleCleaners(admin, {
    date,
    startTime: opts.timeHm,
    durationMinutes,
    locationId: loc,
    locationExpandedIds: [loc],
  });

  if (serverCount < 1) {
    return {
      ok: false,
      status: 409,
      error: "No cleaners are available for this time and area. Pick another slot or area.",
    };
  }

  const ccRaw = body.cleanersCount ?? body.cleaners_count;
  const clientCount =
    typeof ccRaw === "number" && Number.isFinite(ccRaw) ? Math.max(0, Math.round(ccRaw)) : null;
  if (clientCount === null) {
    return { ok: true };
  }
  if (clientCount !== serverCount) {
    return {
      ok: false,
      status: 409,
      error: "Slot availability changed for this area. Refresh times and try again.",
    };
  }

  return { ok: true };
}
