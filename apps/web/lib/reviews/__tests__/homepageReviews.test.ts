import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
const mocks = vi.hoisted(() => ({ admin: vi.fn(), rpc: vi.fn() }));
vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: mocks.admin }));
import { getPublishedReviews, parsePublishedReviews } from "../publishedReviews";
import { parseReviewsPage, reviewsPagePath } from "../reviewPagination";
import { PublishedReviewsSection } from "@/components/reviews/PublishedReviewsSection";
import { PublicReviewCards } from "@/components/reviews/PublicReviewCards";
import { getHomepageReviews, parseHomepageReviews } from "../homepageReviews";
import { ReviewPublicationControls } from "@/components/review/ReviewPublicationControls";
import { ReviewDisplayOptions } from "@/components/review/ReviewDisplayOptions";
import { buildReviewsPageJsonLd } from "@/lib/seo/reviewsPageJsonLd";
import { MarketingHomeReviewsSection } from "@/components/marketing-home/sections/MarketingHomeReviewsSection";
const row = { id: "review", rating: 5, comment: "Excellent clean", created_at: "2026-10-19T15:21:00Z" };
beforeEach(() => { vi.clearAllMocks(); mocks.admin.mockReturnValue({ rpc: mocks.rpc }); mocks.rpc.mockResolvedValue({ data: [row], error: null }); });
describe("homepage five-star reviews", () => {
  it("projects only safe fields and rejects non-five-star or empty comments", () => {
    const result = parseHomepageReviews([{ ...row, email: "private@invalid.local", booking_id: "private", address: "private" }, { ...row, rating: 4 }, { ...row, comment: " " }]);
    expect(result).toEqual([{ id: "review", rating: 5, comment: "Excellent clean", createdAt: row.created_at, displayName: null, suburb: null, serviceKey: null }]);
  });
  it("uses the approved projection instead of reading customer or booking tables", async () => {
    await getHomepageReviews();
    expect(mocks.rpc).toHaveBeenCalledWith("homepage_five_star_reviews_v2");
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
  it("renders permitted database context and canonical service links in server HTML", async () => {
    mocks.rpc.mockResolvedValue({ data: [{ ...row, display_name: "Amina R.", suburb_label: "Bellville", service_key: "standard", full_name: "Private Surname", street: "Private Address" }], error: null });
    const html = renderToStaticMarkup(await MarketingHomeReviewsSection());
    expect(html).toContain("Amina R.");
    expect(html).toContain("Bellville");
    expect(html).toContain("Regular Cleaning");
    expect(html).toContain('href="/services/standard-cleaning-cape-town"');
    expect(html).toMatch(/<time[^>]*datetime="2026-10-19T15:21:00Z"/i);
    expect(html).not.toContain("Private Surname");
    expect(html).not.toContain("Private Address");
  });
  it("keeps new detail choices unchecked and optional for anonymous customers", () => {
    const html = renderToStaticMarkup(createElement(ReviewDisplayOptions, { value: { publicDisplayConsent: true, publicNameConsent: false, publicAreaConsent: false, publicServiceConsent: false }, onChange: () => {} }));
    expect((html.match(/checked=""/g) || []).length).toBe(1);
    expect(html).toContain("first name and surname initial");
    expect(html).toContain("no street address");
    expect(html).toContain("Verified customer");
  });
  it("allows Office to uncheck a published detail whose live preview is unavailable", () => {
    const html = renderToStaticMarkup(createElement(ReviewPublicationControls, { review: {
      id: "review", comment: "Excellent clean", homepage_approved: true, public_display_consent: true,
      public_name_consent: true, public_area_consent: false, public_service_consent: false,
      publication_context: { display_name: null, suburb_label: null, service_key: null },
      published_details: { name: true, area: false, service: false },
    }, onSaved: async () => {} }));
    const nameInput = html.match(/<input[^>]*>/)?.[0];
    expect(nameInput).toContain('checked=""');
    expect(nameInput).not.toContain("disabled");
  });
  it("uses honest page and breadcrumb schema without self-serving review ratings", () => {
    const schema = buildReviewsPageJsonLd();
    const graph = schema["@graph"] as Record<string, unknown>[];
    expect(graph.some((node) => node["@type"] === "BreadcrumbList")).toBe(true);
    expect(graph.some((node) => node["@type"] === "Review" || node["@type"] === "AggregateRating")).toBe(false);
    expect(JSON.stringify(schema)).not.toContain('"aggregateRating"');
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


describe("all-rating public reviews listing", () => {
  it("accepts ratings one to five while Home keeps only five", () => {
    const rows = [1, 2, 3, 4, 5].map((rating) => ({ ...row, id: String(rating), rating }));
    expect(parsePublishedReviews(rows).map((review) => review.rating)).toEqual([1, 2, 3, 4, 5]);
    expect(parseHomepageReviews(rows).map((review) => review.rating)).toEqual([5]);
    expect(parsePublishedReviews([{ ...row, rating: 0 }, { ...row, rating: 6 }, { ...row, rating: 4.5 }, { ...row, comment: " " }])).toEqual([]);
  });
  it("reads the separate paginated projection without a five-star or six-review filter", async () => {
    mocks.rpc.mockResolvedValue({ data: Array.from({ length: 13 }, (_, i) => ({ ...row, id: String(i), rating: 4 })), error: null });
    const result = await getPublishedReviews(2);
    expect(mocks.rpc).toHaveBeenCalledWith("published_customer_reviews", { p_offset: 12, p_limit: 13 });
    expect(result?.reviews).toHaveLength(12);
    expect(result?.hasMore).toBe(true);
    const html = renderToStaticMarkup(await PublishedReviewsSection({ page: 2 }));
    expect(html).toContain("4 out of 5 stars");
    expect(html).not.toContain("5 out of 5 stars");
    expect(html).toContain('href="/reviews"');
    expect(html).toContain('href="/reviews?page=3"');
    expect(html).not.toContain("Selected five-star");
  });
  it("renders the actual number of filled stars and escapes lower-rating comments", () => {
    const reviews = parsePublishedReviews([{ ...row, rating: 2, comment: "<b>Needs improvement</b>", email: "Private Email" }]);
    const html = renderToStaticMarkup(createElement(PublicReviewCards, { reviews }));
    expect(html).toContain("2 out of 5 stars");
    expect((html.match(/fill-current/g) || []).length).toBe(2);
    expect(html).toContain("&lt;b&gt;Needs improvement&lt;/b&gt;");
    expect(html).not.toContain("Private Email");
  });
  it("handles unavailable, empty and last-page results without inventing feedback", async () => {
    mocks.rpc.mockResolvedValue({ data: [row], error: null });
    expect((await getPublishedReviews(1))?.hasMore).toBe(false);
    mocks.rpc.mockResolvedValue({ data: [], error: null });
    expect(renderToStaticMarkup(await PublishedReviewsSection({ page: 1 }))).toContain("No published reviews");
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "PGRST202" } });
    expect(await getPublishedReviews(1)).toBeNull();
    expect(renderToStaticMarkup(await PublishedReviewsSection({ page: 1 }))).toContain("temporarily unavailable");
  });
  it("normalizes unsafe pages and gives each page its own canonical schema URL", () => {
    for (const value of [undefined, "0", "-1", "2.5", "1e4", "99999999999999999", ["2", "3"]]) expect(parseReviewsPage(value)).toBe(1);
    expect(parseReviewsPage("2")).toBe(2);
    expect(reviewsPagePath(1)).toBe("/reviews");
    expect(reviewsPagePath(2)).toBe("/reviews?page=2");
    expect(JSON.stringify(buildReviewsPageJsonLd(2))).toContain("/reviews?page=2");
  });
});
