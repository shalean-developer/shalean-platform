import type { CapeTownLocationRow } from "@/lib/seo/capeTownLocations";
import type { HubContentTier } from "@/lib/seo/location-priority";

function lifestyleOpening(row: CapeTownLocationRow): string {
  const { name, city, region } = row;
  const t = new Set(row.propertyTypes);
  if (t.has("short_stay") && (row.locationType === "coastal" || row.locationType === "urban")) {
    return `${name} hosts often juggle check-out photos, linen resets, and tight kitchen timelines—recurring or turnover-focused cleans keep guest ratings steady without burning weekday evenings in ${city}.`;
  }
  if (t.has("student_share") || t.has("apartment")) {
    return `Compact kitchens, shared bathrooms, and high-touch surfaces define many ${name} flats—scoped visits respect lift access and noise-sensitive neighbours while still resetting wet areas properly between busy weeks in ${region}.`;
  }
  if (t.has("family_home") && row.locationType === "suburban") {
    return `School-week schedules, pets, and garden-adjacent dust mean ${name} family homes benefit from predictable cadences—deep resets for holidays or inspections, then lighter upkeep cycles that match how your household actually uses each room.`;
  }
  if (row.locationType === "estate") {
    return `Larger footprints and entertaining zones in ${name} need honest time on floors, kitchens, and bathrooms—book scoped deep cycles before guests or handovers, then maintain with standard visits that preserve the finish on fixtures you use daily.`;
  }
  if (row.locationType === "coastal" || row.locationType === "blouberg") {
    return `Sea breeze and balcony tracks raise vacuum and mop dwell time in ${name}—note outdoor zones when you want them in scope so crews budget realistic minutes alongside indoor resets.`;
  }
  return `Between workdays and weekend plans, ${name} households still need dependable kitchens and bathrooms—match intensity to your season (guests, renovations, or plain upkeep) so each visit reflects real life in ${region}.`;
}

function lifestyleClosing(row: CapeTownLocationRow): string {
  const { name, city } = row;
  return `Tell us how ${name} living shows up in your home—pets, parking, stairs, or rental inspections—so ${city} teams arrive briefed and your locked quote matches the checklist you approved online.`;
}

/**
 * Additional body copy for topical depth (property + environment + lifestyle), scaled by tier.
 */
export function buildLifestyleDepthParagraphs(row: CapeTownLocationRow, tier: HubContentTier): string[] {
  if (tier === "base") return [lifestyleOpening(row)];
  return [lifestyleOpening(row), lifestyleClosing(row)];
}
