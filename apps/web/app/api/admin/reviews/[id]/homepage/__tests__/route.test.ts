import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), admin: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/admin/requirePermission", () => ({ requireAdminPermissionFromRequest: mocks.auth }));
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: mocks.admin }));
import { POST } from "../route";
const id = "33333333-3333-4333-8333-333333333333";
const context = { params: Promise.resolve({ id }) };
function request(body: unknown) { return new Request("http://localhost/api/admin/reviews/" + id + "/homepage", { method: "POST", body: JSON.stringify(body) }); }
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ ok: true, user: { id: "publisher-id" } });
  mocks.admin.mockReturnValue({ rpc: mocks.rpc });
  mocks.rpc.mockResolvedValue({ data: null, error: null });
});
describe("homepage review publishing", () => {
  it("requires the publishing permission before reading or changing data", async () => {
    mocks.auth.mockResolvedValue({ ok: false, response: new Response(null, { status: 403 }) });
    expect((await POST(request({ approved: true }), context)).status).toBe(403);
    expect(mocks.auth).toHaveBeenCalledWith(expect.any(Request), "content.publish");
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it("binds approval to the authenticated actor and explicit confirmation", async () => {
    const response = await POST(request({ approved: true, expectedConsent: false, permissionConfirmed: true, expectedComment: "Checked comment", actorId: "forged" }), context);
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("set_review_homepage_publication", {
      p_review_id: id, p_publish: true, p_actor_id: "publisher-id", p_permission_confirmed: true, p_expected_comment: "Checked comment", p_expected_consent: false,
    });
  });
  it("does not treat a truthy string as permission confirmation", async () => {
    await POST(request({ approved: true, expectedConsent: false, permissionConfirmed: "true" }), context);
    expect(mocks.rpc.mock.calls[0][1].p_permission_confirmed).toBe(false);
  });
  it("rejects invalid payloads without a database call", async () => {
    expect((await POST(request(null), context)).status).toBe(400);
    expect((await POST(request({ approved: "true" }), context)).status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("returns controlled eligibility failures to Office", async () => {
    mocks.rpc.mockResolvedValue({ error: { code: "P0001", message: "Only visible five-star reviews with a written comment can be approved." } });
    expect((await POST(request({ approved: true, expectedConsent: false }), context)).status).toBe(400);
  });
  it("rejects missing or string-valued reviewed consent", async () => {
    expect((await POST(request({ approved: true }), context)).status).toBe(400);
    expect((await POST(request({ approved: true, expectedConsent: "false" }), context)).status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("supports removal without requiring another permission attestation", async () => {
    expect((await POST(request({ approved: false }), context)).status).toBe(200);
    expect(mocks.rpc.mock.calls[0][1].p_publish).toBe(false);
  });
});
