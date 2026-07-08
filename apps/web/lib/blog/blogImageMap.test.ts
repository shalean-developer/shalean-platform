import { describe, expect, it } from "vitest";
import {
  coerceBlogImageSrcForNext,
  resolveBlogFeaturedAlt,
  resolveBlogFeaturedImageSlug,
  resolveBlogFeaturedSrc,
} from "@/lib/blogImageMap";

const CMS_LOCAL_UPLOAD = "/images/marketing/professional-cleaner-cape-town.webp";

describe("resolveBlogFeaturedImageSlug", () => {
  it("aliases governed prepare-home slug to legacy pinned slug", () => {
    expect(resolveBlogFeaturedImageSlug("how-to-prepare-home-before-cleaner-arrives-cape-town")).toBe(
      "prepare-home-before-cleaner-arrives-cape-town",
    );
  });
});

describe("resolveBlogFeaturedSrc", () => {
  it("uses pinned hero for governed prepare-home slug when CMS has no image", () => {
    expect(resolveBlogFeaturedSrc("how-to-prepare-home-before-cleaner-arrives-cape-town", null)).toBe(
      "/images/marketing/shalean-cleaner-balcony-cape-town.webp",
    );
  });

  it("prefers a trusted CMS upload over the slug pin map", () => {
    expect(
      resolveBlogFeaturedSrc("how-to-prepare-home-before-cleaner-arrives-cape-town", CMS_LOCAL_UPLOAD),
    ).toBe(CMS_LOCAL_UPLOAD);
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

  it("keeps trusted CMS upload URLs for next/image", () => {
    expect(
      coerceBlogImageSrcForNext("how-to-prepare-home-before-cleaner-arrives-cape-town", CMS_LOCAL_UPLOAD),
    ).toBe(CMS_LOCAL_UPLOAD);
  });
});

describe("resolveBlogFeaturedAlt", () => {
  it("uses CMS alt when provided", () => {
    expect(
      resolveBlogFeaturedAlt("how-to-prepare-home-before-cleaner-arrives-cape-town", "Cleaner with supplies in Cape Town home"),
    ).toBe("Cleaner with supplies in Cape Town home");
  });

  it("uses editorial alt override when CMS alt is empty", () => {
    expect(resolveBlogFeaturedAlt("how-to-prepare-home-before-cleaner-arrives-cape-town", null)).toBe(
      "How to prepare your home before a cleaner arrives in Cape Town",
    );
  });
});
