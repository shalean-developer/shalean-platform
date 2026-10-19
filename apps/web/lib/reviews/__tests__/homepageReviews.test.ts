import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
const mocks = vi.hoisted(() => ({ admin: vi.fn(), rpc: vi.fn() }));
vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: mocks.admin }));
import { getHomepageReviews, parseHomepageReviews } from "../homepageReviews";
import { MarketingHomeReviewsSection } from "@/components/marketing-home/sections/MarketingHomeReviewsSection";
const row = { id: "review", rating: 5, comment: "Excellent clean", created_at: "2026-10-19T15:21:00Z" };
beforeEach(() => { vi.clearAllMocks(); mocks.admin.mockReturnValue({ rpc: mocks.rpc }); mocks.rpc.mockResolvedValue({ data: [row], error: null }); });
describe("homepage five-star reviews", () => {
  it("projects only safe fields and rejects non-five-star or empty comments", () => {
    const result = parseHomepageReviews([{ ...row, email: "private@invalid.local", booking_id: "private", address: "private" }, { ...row, rating: 4 }, { ...row, comment: " " }]);
    expect(result).toEqual([{ id: "review", rating: 5, comment: "Excellent clean", createdAt: row.created_at }]);
  });
  it("uses the approved projection instead of reading customer or booking tables", async () => {
    await getHomepageReviews();
    expect(mocks.rpc).toHaveBeenCalledWith("homepage_five_star_reviews");
  });
  it("renders anonymous attribution and escaped text without changing Google or overall ratings", async () => {
    mocks.rpc.mockResolvedValue({ data: [{ ...row, comment: '<script>alert("x")</script>' }], error: null });
    const html = renderToStaticMarkup(await MarketingHomeReviewsSection());
    expect(html).toContain("Selected five-star customer reviews");
    expect(html).toContain("Verified customer");
    expect(html).toContain("5 out of 5 stars");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("Google");
  });
  it("hides the section when empty or unavailable", async () => {
    mocks.rpc.mockResolvedValue({ data: [], error: null });
    expect(await MarketingHomeReviewsSection()).toBeNull();
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "PGRST202" } });
    expect(await MarketingHomeReviewsSection()).toBeNull();
    mocks.rpc.mockRejectedValue(new Error("network failure"));
    expect(await getHomepageReviews()).toEqual([]);
    mocks.admin.mockReturnValue(null);
    expect(await getHomepageReviews()).toEqual([]);
  });
});
