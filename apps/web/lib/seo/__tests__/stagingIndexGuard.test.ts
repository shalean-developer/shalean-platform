import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

vi.mock("@/lib/supabase/supabaseMiddleware", () => ({ updateSession: vi.fn() }));
import { updateSession } from "@/lib/supabase/supabaseMiddleware";
import { proxy } from "@/proxy";

const session = vi.mocked(updateSession);
const request = (path = "/blog/example") => new NextRequest(`https://pricing-test.shalean.co.za${path}`);

describe("SEO-ENV-01 non-production indexing guard", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("VERCEL_GIT_COMMIT_REF", "");
    vi.stubEnv("SHALEAN_APP_ENV", "staging");
    session.mockReset().mockResolvedValue(NextResponse.next());
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

  it.each(["staging", "stage", "development", "preview", "local"])("blocks a production build identified as %s", async (env) => {
    vi.stubEnv("SHALEAN_APP_ENV", env);
    expect((await proxy(request())).headers.get("X-Robots-Tag")).toContain("noindex");
  });
  it("preserves indexability for declared Plesk production", async () => {
    vi.stubEnv("SHALEAN_APP_ENV", "production");
    const response = await proxy(new NextRequest("https://shalean.co.za/blog/example"));
    expect(response.headers.get("X-Robots-Tag")).toBeNull();
  });
  it("protects early redirect responses on staging", async () => {
    const response = await proxy(request("/c/example"));
    expect(response.status).toBe(307);
    expect(response.headers.get("X-Robots-Tag")).toContain("noindex");
  });
  it.each([
    ["/home-cleaning", "/services/standard-cleaning-cape-town", 308],
    ["/help", "/faq", 308],
    ["/c/example", "/campaigns/example", 307],
  ])("protects legacy redirect %s on staging", async (path, destination, status) => {
    const response = await proxy(request(path));
    expect(response.status).toBe(status);
    expect(new URL(response.headers.get("location")!).pathname).toBe(destination);
    expect(response.headers.get("X-Robots-Tag")).toContain("noindex");
  });
  it("protects the passthrough response after session failure", async () => {
    session.mockRejectedValueOnce(new Error("session unavailable"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await proxy(request())).headers.get("X-Robots-Tag")).toContain("noindex");
  });
  it("retains Vercel preview protection even with an explicit production setting", async () => {
    vi.stubEnv("SHALEAN_APP_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "preview");
    expect((await proxy(request())).headers.get("X-Robots-Tag")).toContain("noindex");
  });
  it("retains the production preview-token exclusion", async () => {
    vi.stubEnv("SHALEAN_APP_ENV", "production");
    const response = await proxy(request("/blog/example?preview=test-token"));
    expect(response.headers.get("X-Robots-Tag")).toContain("noindex");
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
  });
  it("protects framework redirects before proxy execution only on the staging host", async () => {
    // next.config redirects (/c/:slug, /home-cleaning, etc.) run before proxy.
    const { default: config } = await import("../../../next.config");
    const rules = await config.headers?.();
    expect(rules).toBeDefined();
    const stagingRule = rules?.find((rule) =>
      rule.source === "/:path*" &&
      rule.has?.some((condition) =>
        condition.type === "host" && condition.value === "pricing-test.shalean.co.za"
      )
    );
    expect(stagingRule?.headers).toContainEqual({
      key: "X-Robots-Tag",
      value: "noindex, nofollow, noimageindex",
    });
    expect(rules?.filter((rule) =>
      rule.headers.some((header) => header.key.toLowerCase() === "x-robots-tag")
    )).toEqual([stagingRule]);
  });
});
