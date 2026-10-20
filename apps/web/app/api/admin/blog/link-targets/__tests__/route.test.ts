import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ allowed: true, dbError: false, filters: [] as unknown[][], read: vi.fn() }));
vi.mock("@/lib/blog/admin-blog-auth", () => ({ requireBlogRead: async () => state.allowed ? { ok: true } : { ok: false, response: new Response("Unauthorized", { status: 401 }) } }));
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => ({ from: () => {
  state.read();
  const query = { select: () => query, eq: (...args: unknown[]) => { state.filters.push(args); return query; }, lte: (...args: unknown[]) => { state.filters.push(args); return query; }, not: (...args: unknown[]) => { state.filters.push(args); return query; }, order: async () => ({ data: [{ slug: "public-guide", title: "Published cleaning guide" }], error: state.dbError ? { message: "private database detail" } : null }) };
  return query;
} }) }));
import { GET } from "../route";
beforeEach(() => { state.allowed = true; state.dbError = false; state.filters = []; vi.clearAllMocks(); });
describe("blog link target API", () => {
  it("rejects unauthorized reads before touching the database", async () => {
    state.allowed = false;
    expect((await GET(new Request("https://example.com/api/admin/blog/link-targets"))).status).toBe(401);
    expect(state.read).not.toHaveBeenCalled();
  });
  it("uses only published, due posts with content and returns private uncached results", async () => {
    const response = await GET(new Request("https://example.com/api/admin/blog/link-targets?q=Published"));
    expect(response.status).toBe(200);
    expect(state.filters).toContainEqual(["status", "published"]);
    expect(state.filters.some(filter => filter[0] === "published_at" && Number.isFinite(Date.parse(String(filter[1]))))).toBe(true);
    expect(state.filters).toContainEqual(["content_json", "is", null]);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect((await response.json()).targets).toEqual([{ url: "/blog/public-guide", label: "Published cleaning guide", kind: "Blog" }]);
  });
  it("fails closed when live targets cannot be verified", async () => {
    state.dbError = true;
    const response = await GET(new Request("https://example.com/api/admin/blog/link-targets"));
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain("private database detail");
  });
});
