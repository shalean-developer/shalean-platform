/** Collect Next.js `searchParams` into a single URLSearchParams (server pages). */
export function collectLegacyBookingSearchParams(
  sp: Record<string, string | string[] | undefined>,
): URLSearchParams {
  const qs = new URLSearchParams();
  for (const [key, raw] of Object.entries(sp)) {
    if (raw === undefined) continue;
    if (Array.isArray(raw)) {
      for (const v of raw) {
        if (v !== undefined && v !== "") qs.append(key, v);
      }
    } else if (raw !== "") {
      qs.append(key, raw);
    }
  }
  return qs;
}
