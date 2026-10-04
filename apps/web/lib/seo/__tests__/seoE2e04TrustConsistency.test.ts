import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  GOOGLE_BUSINESS_REVIEWS,
  areGoogleBusinessReviewsFresh,
  googleReviewsBookingSocialProofLine,
  googleReviewsMarketingHeadline,
} from "@/lib/seo/googleReviews";
import {
  PUBLIC_AGGREGATE_RATING,
  PUBLIC_AGGREGATE_REVIEW_COUNT,
  publicTrustRatingCardTitle,
} from "@/lib/home/publicTrustRating";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("SEO-E2E-04 dynamic trust consistency", () => {
  it("uses one verified GBP aggregate as the public Google trust source", () => {
    expect(GOOGLE_BUSINESS_REVIEWS).toEqual({
      rating: 4.8,
      count: 137,
      verifiedAt: "2026-09-28",
    });
    expect(PUBLIC_AGGREGATE_RATING).toBe(GOOGLE_BUSINESS_REVIEWS.rating);
    expect(PUBLIC_AGGREGATE_REVIEW_COUNT).toBe(GOOGLE_BUSINESS_REVIEWS.count);
    expect(areGoogleBusinessReviewsFresh(new Date("2026-09-28T12:00:00Z"))).toBe(true);
  });

  it("builds public trust copy from the same aggregate", () => {
    expect(googleReviewsMarketingHeadline()).toContain("4.8");
    expect(googleReviewsMarketingHeadline()).toContain("137");
    expect(googleReviewsBookingSocialProofLine()).toBe("4.8★ from 137 Google reviews");
    expect(publicTrustRatingCardTitle(null)).toBe(
      "Rated 4.8 ★ from 137 Google reviews",
    );
  });

  it("does not let booking-review RPC stats override Google trust copy", () => {
    const locationTrust = read("components/seo/LocationTrustSignals.tsx");
    expect(locationTrust).toContain("GOOGLE_BUSINESS_REVIEWS.rating");
    expect(locationTrust).toContain("GOOGLE_BUSINESS_REVIEWS.count");
    expect(locationTrust).not.toContain("rpcAvg");
    expect(locationTrust).not.toContain("rpcCount");
    expect(locationTrust).not.toContain("trustStats?.avgRating");
    expect(locationTrust).not.toContain("trustStats?.reviewCount");
  });

  it("keeps Google third-party ratings out of self-authored organization/business AggregateRating markup", () => {
    const servicePage = read("components/seo/SeoCapeTownServicePage.tsx");
    const primaryBusiness = read("lib/seo/primaryLocalBusinessJsonLd.ts");
    const locationStructuredData = read("lib/seo/structured-data.ts");
    const about = read("components/about/AboutPageView.tsx");

    expect(servicePage).not.toContain("localBusinessNode.aggregateRating");
    expect(servicePage).not.toContain('"@type": "AggregateRating"');
    expect(primaryBusiness).not.toContain("aggregateRating:");
    expect(locationStructuredData).not.toContain("aggregateRating");
    expect(locationStructuredData).not.toContain("googleBusinessAggregateRatingSchema");
    expect(about).not.toContain("aggregateRating:");
    expect(about).not.toContain("googleBusinessAggregateRatingSchema");
  });


  it("does not fetch the legacy public-review aggregate on service or location SEO routes", () => {
    const serviceRoute = read("app/services/[service]/page.tsx");
    const locationRoute = read("app/locations/[slug]/page.tsx");

    expect(serviceRoute).not.toContain("getPublicReviewBannerStats");
    expect(locationRoute).not.toContain("getPublicReviewBannerStats");
    expect(serviceRoute).not.toContain("trustStats=");
    expect(locationRoute).not.toContain("trustStats=");
  });

  it("limits GBP-derived location copy to facts represented by the global aggregate", () => {
    const locationTrust = read("components/seo/LocationTrustSignals.tsx");
    expect(locationTrust).toContain("Google reviewers across Cape Town");
    expect(locationTrust).not.toContain("recurring visits");
    expect(locationTrust).not.toContain("including recurring");
  });

  it("removes stale hard-coded Google counts and rating strings from core public trust surfaces", () => {
    const surfaces = [
      "app/lp/cleaning/page.tsx",
      "components/seo/LocationTrustSignals.tsx",
      "components/seo/LocationHubRankingSections.tsx",
      "components/marketing-home/sections/MarketingGoogleReviewsBand.tsx",
      "components/reviews/ReviewsPageContent.tsx",
      "components/about/AboutPageView.tsx",
      "components/marketing-pricing/CleaningPricesCapeTownPage.tsx",
      "components/marketing-maid/MaidServicesCapeTownPage.tsx",
      "lib/booking/copy.ts",
    ].map(read).join("\n");

    expect(surfaces).not.toMatch(/\b128\+?\b/);
    expect(surfaces).not.toMatch(/\b129\+?\b/);
    expect(surfaces).not.toContain("4.8★ average rating");
  });
});
