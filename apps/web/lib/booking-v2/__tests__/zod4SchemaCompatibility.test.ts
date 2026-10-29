import { describe, expect, it } from "vitest";
import { bookingV2QuoteSchema, step1Schema, signInSchema } from "@/src/features/booking-v2/schemas";
import { safeParseBlogContentJson } from "@/lib/blog/content-json-schema";
import { BLOG_CONTENT_JSON_SCHEMA_VERSION } from "@/lib/blog/content-json";

const details = {
  address: "10 Example Road", suburb: "Claremont",
  serviceAreaLocationId: "11111111-1111-4111-8111-111111111111", contactPhone: "+27821234567",
  serviceDetails: { bedrooms: 2, pets: true, supplies: false, notes: "test", unused: null },
};
describe("Zod 4 application schema compatibility", () => {
  it("preserves typed service details, normalizes booleans and applies booking defaults", () => {
    const result = step1Schema.parse(details);
    expect(result.serviceDetails).toEqual({ bedrooms: 2, pets: "yes", supplies: "no", notes: "test" });
    expect(result.selectedExtras).toEqual([]);
    expect(result.equipmentRequired).toBe("no");
    expect(result.equipmentQuote).toBeNull();
    expect(result.city).toBe("Cape Town");
  });
  it("keeps quote record parsing and default equipment values", () => {
    const result = bookingV2QuoteSchema.parse({ serviceSlug: "regular-cleaning", serviceDetails: { bedrooms: 2 }, bookingType: "once_off", cleanerMode: "team" });
    expect(result.serviceDetails).toEqual({ bedrooms: 2 });
    expect(result.equipmentRequired).toBe("no");
    expect(result.cleanerCount).toBe(1);
  });
  it("keeps field-specific booking error messages available through issues", () => {
    const result = step1Schema.safeParse({ ...details, address: "", contactPhone: "" });
    expect(result.success).toBe(false);
    if (result.success) throw new Error("Expected invalid input");
    expect(result.error.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: ["address"], message: "Enter your street address" }),
      expect.objectContaining({ path: ["contactPhone"], message: "Enter a contact phone number" }),
    ]));
  });
  it("still rejects invalid sign-in details", () => {
    expect(signInSchema.safeParse({ email: "invalid", password: "" }).success).toBe(false);
  });
  it("preserves strict CMS parsing and exposes invalid block paths", () => {
    const valid = { schema_version: BLOG_CONTENT_JSON_SCHEMA_VERSION, blocks: [{ type: "paragraph", content: "Example" }] };
    expect(safeParseBlogContentJson(valid).success).toBe(true);
    const invalid = safeParseBlogContentJson({ ...valid, blocks: [{ type: "paragraph", content: 42 }] });
    expect(invalid.success).toBe(false);
    if (invalid.success) throw new Error("Expected invalid block");
    expect(invalid.error.issues.length).toBeGreaterThan(0);
    expect(safeParseBlogContentJson({ ...valid, unexpected: true }).success).toBe(false);
  });
});
