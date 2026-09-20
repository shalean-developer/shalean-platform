import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { explicitBookServiceSlugFromParam } from "@/lib/booking/legacyBookingToBookRedirect";

const pageSource = readFileSync(
  join(process.cwd(), "app/(ui-redesign)/book/[serviceSlug]/page.tsx"),
  "utf8",
);

describe("Booking V2 canonical service route", () => {
  it("maps Office query intent to the Office booking slug", () => {
    expect(explicitBookServiceSlugFromParam("office-cleaning")).toBe(
      "office-cleaning",
    );
    expect(explicitBookServiceSlugFromParam("office")).toBe("office-cleaning");
  });

  it("supports all six canonical service slugs", () => {
    for (const slug of [
      "regular-cleaning",
      "deep-cleaning",
      "moving-cleaning",
      "office-cleaning",
      "airbnb-cleaning",
      "carpet-cleaning",
    ] as const) {
      expect(explicitBookServiceSlugFromParam(slug)).toBe(slug);
    }
  });

  it("redirects a mismatched path slug to the explicit service query slug", () => {
    expect(pageSource).toContain(
      "requestedServiceSlug && requestedServiceSlug !== serviceSlug",
    );
    expect(pageSource).toContain("redirect(");
    expect(pageSource).toContain("/book/${requestedServiceSlug}");
    expect(pageSource).toContain('qs ? `?${qs}` : ""');
  });

  it("preserves the incoming query string during canonicalization", () => {
    expect(pageSource).toContain(
      "const query = collectLegacyBookingSearchParams(rawSearchParams);",
    );
    expect(pageSource).toContain('query.set("service", requestedServiceSlug);');
    expect(pageSource).toContain("const qs = query.toString();");
  });
});
