import { describe, expect, it } from "vitest";
import {
  absoluteCampaignUrl,
  campaignLandingPath,
  canonicalizePublicSiteUrl,
  siteOrigin,
} from "@/lib/promotions/offerCopy";

describe("campaign public URLs", () => {
  it("rewrites legacy shalean.com campaign origins to canonical offers URLs", () => {
    expect(canonicalizePublicSiteUrl("https://shalean.com/campaigns/first-15")).toBe(
      "https://shalean.co.za/offers/first-15",
    );
    expect(canonicalizePublicSiteUrl("https://www.shalean.com/campaigns/x?utm_source=facebook")).toBe(
      "https://shalean.co.za/offers/x?utm_source=facebook",
    );
  });

  it("uses offers for default and legacy stored campaign landing paths", () => {
    expect(campaignLandingPath({ slug: "first-15", landing_page_path: null })).toBe(
      "/offers/first-15",
    );
    expect(campaignLandingPath({ slug: "x", landing_page_path: "/campaigns/x" })).toBe(
      "/offers/x",
    );
  });

  it("builds absolute customer-facing offer URLs on .co.za", () => {
    expect(absoluteCampaignUrl({ slug: "first-15", landing_page_path: null })).toContain(
      "shalean.co.za/offers/first-15",
    );
    expect(absoluteCampaignUrl({ slug: "x", landing_page_path: "https://shalean.com/campaigns/x" })).toBe(
      "https://shalean.co.za/offers/x",
    );
  });

  it("normalizes relative legacy campaign URLs before publishing", () => {
    expect(canonicalizePublicSiteUrl("/campaigns/spring-clean?utm_medium=qr")).toBe(
      `${siteOrigin()}/offers/spring-clean?utm_medium=qr`,
    );
  });

  it("siteOrigin never returns shalean.com", () => {
    expect(siteOrigin()).not.toMatch(/shalean\.com$/i);
  });
});
