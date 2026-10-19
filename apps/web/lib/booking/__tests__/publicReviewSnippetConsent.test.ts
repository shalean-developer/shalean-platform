import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

const cleaner = vi.hoisted(() => ({ id: "11111111-1111-4111-8111-111111111111", full_name: "Cleaner", is_active: true, is_available: true, status: "available", rating: 4.5, review_count: 4 }));
vi.mock("@/lib/booking/getEligibleCleaners", async (original) => ({
  ...await original<typeof import("@/lib/booking/getEligibleCleaners")>(),
  getEligibleCleaners: async () => [cleaner],
}));
import { getAvailableCleaners } from "../availabilityEngine";

describe("public booking cleaner review snippets", () => {
  it("removes a written quote after permission is withdrawn while retaining aggregate ratings", async () => {
    let consent = true;
    const admin = { from(table: string) {
      const filters = new Map<string, unknown>();
      const query = {
        select: () => query,
        eq: (field: string, value: unknown) => { filters.set(field, value); return query; },
        in: () => query, order: () => query, limit: () => query,
        then: (resolve: (value: unknown) => unknown) => Promise.resolve(resolve({
          data: table === "cleaners" ? [cleaner] : table === "reviews"
            ? (filters.has("public_display_consent") && filters.get("public_display_consent") !== consent ? [] : [{ rating: 5, comment: "Excellent cleaning" }])
            : [], error: null,
        })),
      };
      return query;
    } } as unknown as SupabaseClient;
    const args = { selectedDate: "2026-10-19", selectedTime: "10:00", availabilityRows: [] };
    const before = await getAvailableCleaners(admin, args);
    expect(before[0].recent_reviews).toEqual([{ rating: 5, quote: "Excellent cleaning" }]);
    consent = false;
    const after = await getAvailableCleaners(admin, args);
    expect(after[0].recent_reviews).toEqual([]);
    expect(after[0].rating).toBe(4.5);
    expect(after[0].review_count).toBe(4);
  });
});
