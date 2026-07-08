import { describe, expect, it } from "vitest";
import {
  coerceBlogImageSrcForNext,
  resolveBlogFeaturedAlt,
  resolveBlogFeaturedImageSlug,
  resolveBlogFeaturedSrc,
} from "@/lib/blogImageMap";

describe("resolveBlogFeaturedImageSlug", () => {
  it("aliases governed prepare-home slug to legacy pinned slug", () => {
    expect(resolveBlogFeaturedImageSlug("how-to-prepare-home-before-cleaner-arrives-cape-town")).toBe(
      "prepare-home-before-cleaner-arrives-cape-town",
    );
  });
});

describe("resolveBlogFeaturedSrc", () => {
  it("uses pinned hero for governed prepare-home slug", () => {
    expect(resolveBlogFeaturedSrc("how-to-prepare-home-before-cleaner-arrives-cape-town", null)).toBe(
      "/images/marketing/shalean-cleaner-balcony-cape-town.webp",
    );
  });

  it("ignores generic default CMS placeholder in favour of slug map", () => {
    expect(
      resolveBlogFeaturedSrc(
        "how-to-prepare-home-before-cleaner-arrives-cape-town",
        "/images/default-cleaning.jpg",
      ),
    ).toBe("/images/marketing/shalean-cleaner-balcony-cape-town.webp");
  });

  it("rejects missing /images/posts CMS paths", () => {
    expect(
      resolveBlogFeaturedSrc(
        "how-to-prepare-home-before-cleaner-arrives-cape-town",
        "/images/posts/how-to-prepare-your-home-before-cleaner-arrives-cape-town.webp",
      ),
    ).toBe("/images/marketing/shalean-cleaner-balcony-cape-town.webp");
  });
});

describe("coerceBlogImageSrcForNext", () => {
  it("coerces untrusted local CMS paths to mapped hero", () => {
    expect(
      coerceBlogImageSrcForNext(
        "how-to-prepare-home-before-cleaner-arrives-cape-town",
        "/images/posts/how-to-prepare-your-home-before-cleaner-arrives-cape-town.webp",
      ),
    ).toBe("/images/marketing/shalean-cleaner-balcony-cape-town.webp");
  });
});

describe("resolveBlogFeaturedAlt", () => {
  it("uses editorial alt override for governed prepare-home slug", () => {
    expect(
      resolveBlogFeaturedAlt(
        "how-to-prepare-home-before-cleaner-arrives-cape-town",
        "Professional how to prepare home before cleaner arrives service in Cape Town",
      ),
    ).toBe("How to prepare your home before a cleaner arrives in Cape Town");
  });
});
