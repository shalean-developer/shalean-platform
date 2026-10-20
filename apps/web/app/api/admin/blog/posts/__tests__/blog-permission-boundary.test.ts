import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ actor: "author", verified: true, previousStatus: "draft", saves: 0, failCache: false }));
const db = vi.hoisted(() => {
  const query: Record<string,unknown> = {};
  for (const method of ["select","eq","lte","neq","order","range","or","not"]) query[method] = () => query;
  query.limit = async () => ({ data: [], error: null });
  query.insert = async () => ({ error: null });
  query.maybeSingle = async () => ({ data: { id: "00000000-0000-4000-8000-000000000010", slug: "fixture", status: state.previousStatus }, error: null });
  return {
    auth: { getUser: async () => ({ data: { user: { id: state.actor, email: "fixture@example.com" } }, error: null }) },
    from: () => query,
    rpc: async (name: string, args: Record<string,unknown>) => {
      if (name === "admin_has_permission") return { data: state.actor === "owner" || (state.actor === "author" && args.p_permission === "content.draft"), error: null };
      if (name === "blog_scheduler_is_enabled") return { data: false, error: null };
      if (name === "blog_save_post") { state.saves++; return { data: { post: { id: "id", slug: "fixture", updated_at: "2026-10-20T12:00:00Z" }, receipt: { saved_at: "2026-10-20T12:00:00Z" } }, error: null }; }
      throw new Error(`Unexpected RPC ${name}`);
    },
  };
});
vi.mock("@supabase/supabase-js", () => ({ createClient: () => db }));
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => db }));
vi.mock("@/lib/auth/officeEmailVerification", () => ({ OFFICE_VERIFICATION_COOKIE: "office", officeSessionBinding: () => "binding", verifyOfficeVerificationToken: () => state.verified }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: () => { if (state.failCache) throw new Error("Cache unavailable"); } }));
import { POST, PUT, GET } from "../route";

function request(status: string, method = "POST", slug = "fixture", published_at: string | null = null) {
  return new Request("https://shalean.co.za/api/admin/blog/posts", { method, headers: { Authorization: "Bearer fixture", "Content-Type": "application/json" }, ...(method === "GET" ? {} : { body: JSON.stringify({ title:"Fixture", slug, status, published_at, content_json:{schema_version:1,blocks:[]}, request_id:"00000000-0000-4000-8000-000000000011", ...(method==="PUT"?{id:"00000000-0000-4000-8000-000000000010",expected_updated_at:"2026-10-20T12:00:00Z"}:{}) }) }) });
}
beforeEach(() => { state.actor="author"; state.verified=true; state.previousStatus="draft"; state.saves=0; state.failCache=false; vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL","https://fixture.supabase.co"); vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY","fixture"); vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY","fixture-server-only"); });

describe("blog API permission boundary", () => {
  it("lets a draft author save a draft through the verified API", async () => { expect((await POST(request("draft"))).status).toBe(201); expect(state.saves).toBe(1); });
  it.each(["published","scheduled"])("denies a draft author trying to save %s", async status => { expect((await POST(request(status))).status).toBe(403); expect(state.saves).toBe(0); });
  it.each(["published","scheduled"])("denies editing or unpublishing existing %s content without publish permission", async previous => { state.previousStatus=previous; expect((await PUT(request("draft","PUT"))).status).toBe(403); expect(state.saves).toBe(0); });
  it("denies an unrelated Office role even for a read", async () => { state.actor="operations"; expect((await GET(request("draft","GET"))).status).toBe(403); });
  it("keeps Office verification mandatory for the owner", async () => { state.actor="owner"; state.verified=false; expect((await POST(request("draft"))).status).toBe(403); expect(state.saves).toBe(0); });
  it("refuses new schedules while the worker is paused", async () => { state.actor="owner"; expect((await POST(request("scheduled"))).status).toBe(503); expect(state.saves).toBe(0); });
  it("rejects a reserved alias even as a draft so it cannot create an uneditable dead end", async () => { expect((await POST(request("draft","POST","cleaning-services-claremont-cape-town"))).status).toBe(400); expect(state.saves).toBe(0); });
  it("requires the scheduling path for a future publish date", async () => { state.actor="owner"; expect((await POST(request("published","POST","future","2099-01-01T00:00:00Z"))).status).toBe(400); expect(state.saves).toBe(0); });
  it("returns the committed save receipt even if public cache refresh fails", async () => { state.failCache=true; const response=await POST(request("draft")); expect(response.status).toBe(201); const result=await response.json(); expect(result.receipt.saved_at).toBeTruthy(); expect(result.governance_warnings.some((w:{code:string})=>w.code==="cache_refresh_pending")).toBe(true); expect(state.saves).toBe(1); });
  it("still applies quality validation after owner authorization", async () => { state.actor="owner"; expect((await POST(request("published"))).status).toBe(400); expect(state.saves).toBe(0); });
});
