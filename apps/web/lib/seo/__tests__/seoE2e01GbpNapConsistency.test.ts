import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildContactPageJsonLdGraph } from "@/lib/seo/contactPageJsonLd";
import { buildPrimaryLocalBusinessBase } from "@/lib/seo/primaryLocalBusinessJsonLd";
import {
  PUBLIC_BUSINESS_ADDRESS,
  PUBLIC_BUSINESS_ADDRESS_LABEL,
  PUBLIC_BUSINESS_EMAIL,
  PUBLIC_BUSINESS_HOURS_LABEL,
  PUBLIC_BUSINESS_NAME,
  PUBLIC_BUSINESS_OPENING_DAYS,
  PUBLIC_BUSINESS_OPENING_HOURS,
} from "@/lib/site/publicBusinessIdentity";
import { CUSTOMER_SUPPORT_TELEPHONE_E164 } from "@/lib/site/customerSupport";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("SEO-E2E-01 GBP-backed NAP consistency", () => {
  it("locks the public business identity to the current GBP facts", () => {
    expect(PUBLIC_BUSINESS_NAME).toBe("Shalean Cleaning Services");
    expect(PUBLIC_BUSINESS_EMAIL).toBe("hello@shalean.co.za");
    expect(PUBLIC_BUSINESS_ADDRESS).toEqual({
      streetAddress: "39 Harvey Rd",
      addressLocality: "Claremont",
      addressRegion: "Western Cape",
      postalCode: "7708",
      addressCountry: "ZA",
    });
    expect(PUBLIC_BUSINESS_ADDRESS_LABEL).toBe(
      "39 Harvey Rd, Claremont, Cape Town, 7708, South Africa",
    );
    expect(PUBLIC_BUSINESS_OPENING_HOURS).toBe("Mo-Su 00:00-23:59");
    expect(PUBLIC_BUSINESS_HOURS_LABEL).toBe("Open 24 hours, 7 days a week");
    expect(PUBLIC_BUSINESS_OPENING_DAYS).toHaveLength(7);
  });

  it("keeps LocalBusiness schema aligned with GBP name, phone, address and 24/7 hours", () => {
    const business = buildPrimaryLocalBusinessBase() as Record<string, unknown>;
    expect(business.name).toBe(PUBLIC_BUSINESS_NAME);
    expect(business.telephone).toBe(CUSTOMER_SUPPORT_TELEPHONE_E164);
    expect(business.email).toBe(PUBLIC_BUSINESS_EMAIL);
    expect(business.openingHours).toBe(PUBLIC_BUSINESS_OPENING_HOURS);
    expect(business.address).toEqual({
      "@type": "PostalAddress",
      ...PUBLIC_BUSINESS_ADDRESS,
    });
  });

  it("uses 24/7 hours and the public email in ContactPage structured data", () => {
    const graph = buildContactPageJsonLdGraph() as {
      "@graph": Array<Record<string, unknown>>;
    };
    const business = graph["@graph"].find((node) => node["@type"] === "LocalBusiness");
    expect(business).toBeTruthy();

    const points = business?.contactPoint as Array<Record<string, unknown>>;
    expect(points).toHaveLength(1);
    expect(points[0]?.email).toBe(PUBLIC_BUSINESS_EMAIL);

    const hours = points[0]?.hoursAvailable as Record<string, unknown>;
    expect(hours.dayOfWeek).toEqual([...PUBLIC_BUSINESS_OPENING_DAYS]);
    expect(hours.opens).toBe("00:00");
    expect(hours.closes).toBe("23:59");
  });

  it("uses the public business email and full GBP address on public marketing surfaces", () => {
    const footer = read("components/marketing-home/sections/MarketingHomeFooter.tsx");
    expect(footer).toContain("PUBLIC_BUSINESS_EMAIL");
    expect(footer).toContain("PUBLIC_BUSINESS_ADDRESS_LABEL");
    expect(footer).not.toContain("CUSTOMER_SUPPORT_EMAIL");

    const contact = read("app/(marketing)/contact/page.tsx");
    expect(contact).toContain("const BUSINESS_EMAIL = PUBLIC_BUSINESS_EMAIL");
    expect(contact).toContain("PUBLIC_BUSINESS_HOURS_LABEL");
    expect(contact).toContain("PUBLIC_BUSINESS_ADDRESS_LABEL");
  });
});
