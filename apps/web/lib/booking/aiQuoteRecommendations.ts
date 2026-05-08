import type { BookingStep1State } from "@/components/booking/useBookingStep1";

export type AiQuoteRecommendation = {
  title: string;
  body: string;
};

function roomLabel(rooms: number): string {
  return `${rooms}-bedroom`;
}

/**
 * Deterministic recommendation layer for Phase 18. It gives the booking UI
 * AI-style quote guidance without adding an LLM dependency before the funnel stabilizes.
 */
export function buildAiQuoteRecommendation(
  state: BookingStep1State,
  estimatedHours: number | null | undefined,
): AiQuoteRecommendation | null {
  const rooms = Math.max(1, Math.round(Number(state.rooms ?? 1)));
  const bathrooms = Math.max(1, Math.round(Number(state.bathrooms ?? 1)));
  const service = String(state.service ?? state.service_type ?? "").toLowerCase();
  const hours =
    typeof estimatedHours === "number" && Number.isFinite(estimatedHours)
      ? Math.max(1, Math.round(estimatedHours * 2) / 2)
      : null;

  if (service.includes("airbnb")) {
    const low = Math.max(2, rooms + bathrooms);
    const high = low + 1;
    return {
      title: "Smart quote recommendation",
      body: `Most ${roomLabel(rooms)} Airbnb turnovers need ${low}-${high} hours depending on laundry and reset depth.${hours ? ` Your current quote is about ${hours} hours.` : ""}`,
    };
  }

  if (service.includes("deep") || state.extras.length >= 3) {
    return {
      title: "Smart quote recommendation",
      body: `Homes with deep-clean scope and ${state.extras.length || "multiple"} extras usually convert best when enough time is reserved for kitchen, bathroom, and detail work.${hours ? ` Your current quote allows about ${hours} hours.` : ""}`,
    };
  }

  if (rooms >= 3 || bathrooms >= 2) {
    return {
      title: "Smart quote recommendation",
      body: `${roomLabel(rooms)} homes with ${bathrooms} bathrooms usually book faster when the visit length is clear before schedule selection.${hours ? ` This quote is about ${hours} hours.` : ""}`,
    };
  }

  return null;
}
