import { describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ tables: [] as string[], filters: [] as [string, unknown][], reviewsRead: 0 }));
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => ({ from: (table: string) => {
  state.tables.push(table);
  const textQuery = table === "reviews" && state.reviewsRead++ === 0;
  const q = {
    select: () => q, eq: (key: string, value: unknown) => { if (textQuery) state.filters.push([key,value]); return q; },
    not: () => q, or: () => q, order: () => q, limit: () => q,
    maybeSingle: async () => ({ data: { id: "11111111-1111-4111-8111-111111111111", full_name: "Cleaner", status: "active" }, error: null }),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(resolve(textQuery ? { data: [{ id: "review", rating: 5, comment: "Great", created_at: "2026-10-19" }], error: null } : { count: 4, error: null })),
  };
  return q;
} }) }));
import { GET } from "../route";
describe("public cleaner feedback privacy", () => {
  it("requires display consent for comments and avoids customer-name lookups", async () => {
    const response = await GET(new Request("http://localhost/api/public-profile"), { params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }) });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(state.filters).toContainEqual(["public_display_consent", true]);
    expect(state.filters).toContainEqual(["bookings.is_test", false]);
    expect(state.tables).not.toContain("bookings");
    expect(body.reviews[0].reviewerName).toBe("Verified customer");
    expect(body.reviewCount).toBe(4);
  });
});
