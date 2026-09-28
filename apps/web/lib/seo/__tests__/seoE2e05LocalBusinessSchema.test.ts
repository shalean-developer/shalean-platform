import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildContactPageJsonLdGraph } from "@/lib/seo/contactPageJsonLd";
import {
  buildPrimaryLocalBusinessBase,
  buildPrimaryLocalBusinessMoneyPageNode,
  capeTownAdministrativeServiceArea,
} from "@/lib/seo/primaryLocalBusinessJsonLd";
import { getBrandSameAsForJsonLd } from "@/lib/site/brandSameAs";
import { CUSTOMER_SUPPORT_TELEPHONE_E164 } from "@/lib/site/customerSupport";
import {
  PUBLIC_BUSINESS_ADDRESS,
  PUBLIC_BUSINESS_EMAIL,
  PUBLIC_BUSINESS_GOOGLE_PLACE_ID,
  PUBLIC_BUSINESS_GOOGLE_PROFILE_URL,
  PUBLIC_BUSINESS_NAME,
  PUBLIC_BUSINESS_OPENING_HOURS,
  PUBLIC_BUSINESS_OPENING_HOURS_SPECIFICATION,
  PUBLIC_BUSINESS_SERVICE_AREA,
} from "@/lib/site/publicBusinessIdentity";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("SEO-E2E-05 LocalBusiness schema verification", () => {
  it("locks the GBP-backed identity fields", () => {
    expect(PUBLIC_BUSINESS_NAME).toBe("Shalean Cleaning Services");
    expect(CUSTOMER_SUPPORT_TELEPHONE_E164).toBe("+27871535250");
    expect(PUBLIC_BUSINESS_EMAIL).toBe("hello@shalean.co.za");
    expect(PUBLIC_BUSINESS_ADDRESS).toEqual({
      streetAddress: "39 Harvey Rd",
      addressLocality: "Claremont",
      addressRegion: "Western Cape",
      postalCode: "7708",
      addressCountry: "ZA",
    });
    expect(PUBLIC_BUSINESS_OPENING_HOURS).toBe("Mo-Su 00:00-23:59");
    expect(PUBLIC_BUSINESS_GOOGLE_PLACE_ID).toBe("ChIJE2azv4FDzB0R6Dif-_0-vn0");
  });

  it("keeps the verified GBP entity permanently in sameAs", () => {
    const sameAs = getBrandSameAsForJsonLd();
    expect(PUBLIC_BUSINESS_GOOGLE_PROFILE_URL).toContain(PUBLIC_BUSINESS_GOOGLE_PLACE_ID);
    expect(sameAs).toContain(PUBLIC_BUSINESS_GOOGLE_PROFILE_URL);
    expect(new Set(sameAs).size).toBe(sameAs.length);
  });

  it("builds one canonical LocalBusiness NAP, hours, sameAs and Cape Town service area", () => {
    const business = buildPrimaryLocalBusinessBase() as Record<string, unknown>;

    expect(business.name).toBe(PUBLIC_BUSINESS_NAME);
    expect(business.telephone).toBe(CUSTOMER_SUPPORT_TELEPHONE_E164);
    expect(business.email).toBe(PUBLIC_BUSINESS_EMAIL);
    expect(business.address).toEqual({
      "@type": "PostalAddress",
      ...PUBLIC_BUSINESS_ADDRESS,
    });
    expect(business.openingHours).toBe(PUBLIC_BUSINESS_OPENING_HOURS);
    expect(business.openingHoursSpecification).toEqual([
      PUBLIC_BUSINESS_OPENING_HOURS_SPECIFICATION,
    ]);
    expect(business.areaServed).toEqual(PUBLIC_BUSINESS_SERVICE_AREA);
    expect(business.sameAs).toEqual(getBrandSameAsForJsonLd());
    expect(business).not.toHaveProperty("geo");
  });

  it("keeps money-page LocalBusiness service area anchored to Cape Town before suburb enrichment", () => {
    const business = buildPrimaryLocalBusinessMoneyPageNode() as {
      areaServed?: Array<Record<string, unknown>>;
    };
    expect(Array.isArray(business.areaServed)).toBe(true);
    expect(business.areaServed?.[0]).toEqual(PUBLIC_BUSINESS_SERVICE_AREA);
  });

  it("uses the same Cape Town service area and 24/7 hours on ContactPoint schema", () => {
    const graph = buildContactPageJsonLdGraph() as {
      "@graph": Array<Record<string, unknown>>;
    };
    const business = graph["@graph"].find((node) => node["@type"] === "LocalBusiness");
    const points = business?.contactPoint as Array<Record<string, unknown>>;

    expect(points).toHaveLength(1);
    expect(points[0]?.telephone).toBe(CUSTOMER_SUPPORT_TELEPHONE_E164);
    expect(points[0]?.email).toBe(PUBLIC_BUSINESS_EMAIL);
    expect(points[0]?.areaServed).toEqual(PUBLIC_BUSINESS_SERVICE_AREA);
    expect(points[0]?.hoursAvailable).toEqual(PUBLIC_BUSINESS_OPENING_HOURS_SPECIFICATION);
  });

  it("uses the same centralized Cape Town service area on Service schema helpers", () => {
    expect(capeTownAdministrativeServiceArea()).toEqual(PUBLIC_BUSINESS_SERVICE_AREA);
  });

  it("reuses the canonical LocalBusiness builder on public service, Airbnb and homepage schema", () => {
    const servicePage = read("components/seo/SeoCapeTownServicePage.tsx");
    const airbnbArea = read("components/seo/AirbnbAreaServiceLanding.tsx");
    const homepage = read("components/home/StructuredData.tsx");

    expect(servicePage).toContain("buildPrimaryLocalBusinessBase()");
    expect(airbnbArea).toContain("buildPrimaryLocalBusinessBase()");
    expect(homepage).toContain("buildPrimaryLocalBusinessBase()");
    expect(homepage).not.toContain(
      'const areaServed = [\n    { "@type": "Country" as const, name: "South Africa" }',
    );

    expect(servicePage).not.toContain('"@type": "LocalBusiness"');
    expect(airbnbArea).not.toContain('"@type": "LocalBusiness"');
    expect(homepage).not.toContain("areaServed,\n    serviceType");
  });

  it("keeps the broader About entity on the same Cape Town service-area contract", () => {
    const about = read("components/about/AboutPageView.tsx");
    expect(about).toContain("PUBLIC_BUSINESS_SERVICE_AREA");
    expect(about).not.toContain('name: "South Africa"');
  });

});
