import { describe, expect, it } from "vitest";
import { revalidate } from "@/app/sitemap";

describe("sitemap route caching", () => {
  it("refreshes after CMS publications without requiring a deployment", () => {
    expect(revalidate).toBeGreaterThan(0);
    expect(revalidate).toBeLessThanOrEqual(300);
  });
});
