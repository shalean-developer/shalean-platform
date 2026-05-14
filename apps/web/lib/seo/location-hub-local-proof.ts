import type { CapeTownLocationRow } from "@/lib/seo/capeTownLocations";

/** Operational dispatch and scope notes — no synthetic volume figures. */
function dispatchFocus(loc: CapeTownLocationRow): string {
  const { name } = loc;
  if (loc.propertyTypes.includes("short_stay")) {
    return `Turnover windows in ${name} lean on tight kitchens, bathrooms, and linen-adjacent dust—call out check-in time and balcony scope so booked hours stay on cleaning, not rework.`;
  }
  if (loc.propertyTypes.includes("student_share")) {
    return `Shared kitchens and high-use bathrooms in ${name} mean crews prioritise wet areas and floors first—note which rooms are in scope when flatmates split a booking.`;
  }
  if (loc.locationType === "coastal" || loc.locationType === "blouberg") {
    return `Coastal grit and balcony tracks in ${name} add mop and vacuum dwell time—flag outdoor zones when you want them inside the same visit.`;
  }
  if (loc.locationType === "estate") {
    return `Larger footprints and service routes in ${name} need accurate room counts and wing notes so crews carry equipment once and work in a sensible sequence.`;
  }
  if (loc.locationType === "northern") {
    return `Northern ${name} jobs often include longer drives and estate or complex rules—boom codes and the fastest kitchen entrance trim dead time on the clock.`;
  }
  if (loc.locationType === "urban") {
    return `Lift-heavy ${name} stock rewards precise intercom, stair, and parking pins so booked hours target kitchens and bathrooms instead of arrival loops.`;
  }
  return `Suburban ${name} visits mix pets, garden dust, and school-week kitchens—calling out high-traffic zones keeps scope aligned with how crews sequence a standard or deep visit.`;
}

function slotPattern(loc: CapeTownLocationRow): string {
  if (loc.locationType === "coastal") {
    return `Saturday mornings and short-stay turnovers near ${loc.name} tend to fill first; mid-week often has more open slots after checkout waves pass.`;
  }
  if (loc.locationType === "urban") {
    return `Early weekday slots suit stair-heavy ${loc.name} buildings before lift traffic peaks; some weekends compete with City Bowl events—book ahead when your date is fixed.`;
  }
  if (loc.locationType === "northern") {
    return `${loc.name} routes often include estate security and longer on-site walks—weekday mornings usually clear faster than late Friday when visitor bays tighten.`;
  }
  return `Thursday–Saturday afternoons around ${loc.name} tighten during school terms; Tuesday/Wednesday mornings typically show wider availability in our live booking flow.`;
}

function accessNotes(loc: CapeTownLocationRow): string {
  if (loc.propertyTypes.includes("student_share") || loc.propertyTypes.includes("apartment")) {
    return `Most ${loc.name} bookings specify lifts, visitor parking, or intercom PINs—those notes trim arrival friction so booked hours target cleaning.`;
  }
  if (loc.propertyTypes.includes("family_home")) {
    return `Family homes in ${loc.name} often add pets, garden mud, and multi-bathroom scope—calling out high-traffic zones keeps quotes aligned with crew time.`;
  }
  return `Access varies street-by-street in ${loc.name}; precise boom, gate, or garage directions prevent crews losing minutes circling the block.`;
}

/** Operational patterns per hub — no fabricated visit counts. */
export function buildLocationLocalProofBullets(loc: CapeTownLocationRow): string[] {
  return [dispatchFocus(loc), slotPattern(loc), accessNotes(loc)];
}
