import { canonicalPreferredAreaName } from "@/lib/cleaner/cleanerPreferredAreaOptions";

export type NormalizeRequestedPreferredAreasResult =
  | { ok: true; value: string[] }
  | { ok: false; error: string };

const MAX_AREAS = 3;

/**
 * Parses `requested_locations` (or legacy `requested_location` string) into ≤3 canonical catalog names.
 */
export function normalizeRequestedPreferredAreas(body: {
  requested_locations?: unknown;
  requested_location?: unknown;
}): NormalizeRequestedPreferredAreasResult {
  let rawItems: unknown[] = [];
  if (Array.isArray(body.requested_locations)) {
    rawItems = body.requested_locations;
  } else if (typeof body.requested_location === "string" && body.requested_location.trim()) {
    rawItems = [body.requested_location.trim()];
  }

  if (rawItems.length === 0) {
    return { ok: false, error: "Select at least one preferred area." };
  }

  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of rawItems) {
    if (typeof item !== "string") continue;
    const canon = canonicalPreferredAreaName(item);
    if (!canon || seen.has(canon)) continue;
    seen.add(canon);
    out.push(canon);
  }

  if (out.length === 0) {
    return { ok: false, error: "Pick valid service areas from the list." };
  }
  if (out.length > MAX_AREAS) {
    return { ok: false, error: `Select at most ${MAX_AREAS} preferred areas.` };
  }

  return { ok: true, value: out };
}
