import { afterEach, describe, expect, it, vi } from "vitest";

describe("programmatic blog link builders vs legacy env", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("when NEXT_PUBLIC_LEGACY_PROGRAMMATIC_ROUTES=false, service SEO pills never point at /blog/*", async () => {
    vi.stubEnv("NEXT_PUBLIC_LEGACY_PROGRAMMATIC_ROUTES", "false");
    vi.resetModules();
    const { getAreaProgrammaticBlogLinksForCapeTownService } = await import("@/lib/blog/programmaticPosts");
    const links = getAreaProgrammaticBlogLinksForCapeTownService("deep-cleaning-cape-town");
    expect(links).not.toBeNull();
    expect(links!.every((l) => !l.href.startsWith("/blog/"))).toBe(true);
    expect(links!.every((l) => l.href.startsWith("/locations/"))).toBe(true);
  });

  it("when legacy programmatic off, hub editorial guide links emit no /blog URLs", async () => {
    vi.stubEnv("NEXT_PUBLIC_LEGACY_PROGRAMMATIC_ROUTES", "false");
    vi.resetModules();
    const { getHubEditorialGuideLinks, getEditorialClusterBlogLinksForHub } = await import(
      "@/lib/blog/programmaticPosts"
    );
    expect(getHubEditorialGuideLinks("claremont-cleaning-services", "Claremont")).toEqual([]);
    const cluster = getEditorialClusterBlogLinksForHub("claremont-cleaning-services", "Claremont");
    expect(cluster.every((l) => !l.href.startsWith("/blog/"))).toBe(true);
    expect(cluster.some((l) => l.href === "/locations/claremont-cleaning-services")).toBe(true);
  });

  it("when legacy programmatic off, programmaticBlogHrefIfExists is always null", async () => {
    vi.stubEnv("NEXT_PUBLIC_LEGACY_PROGRAMMATIC_ROUTES", "false");
    vi.resetModules();
    const { programmaticBlogHrefIfExists } = await import("@/lib/blog/programmaticPosts");
    expect(programmaticBlogHrefIfExists("deep-cleaning-claremont-cape-town")).toBeNull();
  });
});

describe("isRoutableBlogSlug", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("returns false for redirect-only alias slugs (must not be linked directly)", async () => {
    const { isRoutableBlogSlug } = await import("@/lib/blog/validBlogRoutes");
    expect(isRoutableBlogSlug("deep-vs-standard-cleaning-cape-town")).toBe(false);
  });

  it("returns true when slug is in optional published DB slug set", async () => {
    const { isRoutableBlogSlug } = await import("@/lib/blog/validBlogRoutes");
    expect(
      isRoutableBlogSlug("hypothetical-cms-only-slug", {
        dbPublishedSlugs: new Set(["hypothetical-cms-only-slug"]),
      }),
    ).toBe(true);
  });
});
