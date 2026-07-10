import { describe, expect, it } from "vitest";
import {
  absoluteCampaignUrl,
  canonicalizePublicSiteUrl,
  siteOrigin,
} from "@/lib/promotions/offerCopy";

describe("campaign public URLs", () => {
  it("rewrites shalean.com origins to shalean.co.za", () => {
    expect(canonicalizePublicSiteUrl("https://shalean.com/campaigns/first-15")).toBe(
      "https://shalean.co.za/campaigns/first-15",
    );
    expect(canonicalizePublicSiteUrl("https://www.shalean.com/campaigns/x")).toBe(
      "https://shalean.co.za/campaigns/x",
    );
  });

  it("builds absolute campaign URLs on .co.za", () => {
    expect(absoluteCampaignUrl({ slug: "first-15", landing_page_path: null })).toContain(
      "shalean.co.za/campaigns/first-15",
    );
    expect(absoluteCampaignUrl({ slug: "x", landing_page_path: "https://shalean.com/campaigns/x" })).toBe(
      "https://shalean.co.za/campaigns/x",
    );
  });

  it("siteOrigin never returns shalean.com", () => {
    expect(siteOrigin()).not.toMatch(/shalean\.com$/i);
  });
});
