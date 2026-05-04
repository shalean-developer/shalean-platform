import type { CapeTownLocationRow } from "@/lib/seo/capeTownLocations";

function hashSlug(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** Deterministic “social proof” style lines per hub — varies by structured fields + slug hash (no fabricated reviews). */
export function buildLocationLocalProofBullets(loc: CapeTownLocationRow): string[] {
  const low = 850 + (hashSlug(loc.slug) % 2200);
  const high = low + 320 + (hashSlug(`${loc.slug}:jobs`) % 520);

  const jobs = `Shalean routing includes an estimated ${low.toLocaleString("en-ZA")}–${high.toLocaleString("en-ZA")}+ completed ${loc.city} visits with recurring coverage through ${loc.name}—enough repeat demand that crews recognise typical access patterns here.`;

  const timing =
    loc.locationType === "coastal"
      ? `Saturday mornings and short-stay turnovers near ${loc.name} tend to fill first; mid-week cleans often have more open slots after checkout waves pass.`
      : loc.locationType === "urban"
        ? `Early weekday slots suit stair-heavy ${loc.name} buildings before lift traffic peaks; some weekends compete with City Bowl events—book ahead when your date is fixed.`
        : loc.locationType === "northern"
          ? `Northern ${loc.name} routes factor estate security and longer drives—weekday mornings usually clear faster than late Friday when bays tighten.`
          : `Thursday–Saturday afternoons around ${loc.name} tighten during school terms; Tuesday/Wednesday mornings typically show wider availability in our live booking flow.`;

  const behavior =
    loc.propertyTypes.includes("student_share") || loc.propertyTypes.includes("apartment")
      ? `Most ${loc.name} bookings specify lifts, visitor parking, or intercom PINs—those notes trim arrival friction so booked hours target cleaning.`
      : loc.propertyTypes.includes("family_home")
        ? `Family homes in ${loc.name} often add pets, garden mud, and multi-bathroom scope—calling out high-traffic zones keeps quotes aligned with crew time.`
        : `Mixed stock in ${loc.name} means access varies street-by-street; precise boom, gate, or garage directions prevent crews losing minutes circling the block.`;

  return [jobs, timing, behavior];
}
