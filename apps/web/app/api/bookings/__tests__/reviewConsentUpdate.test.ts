import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ user: "owner", owner: "owner", update: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: state.user, email: "owner@invalid.local" } }, error: null }) } }) }));
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => ({ from: () => ({
  select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: "review", user_id: state.owner, created_at: "2020-01-01T00:00:00Z" }, error: null }) }) }),
  update: (patch: unknown) => { state.update(patch); return { eq: async () => ({ error: null }) }; },
}) }) }));
import { PATCH } from "../review/route";
function request(extra: Record<string, unknown>) { return new Request("http://localhost/api/bookings/review", { method: "PATCH", headers: { authorization: "Bearer test" }, body: JSON.stringify({ bookingId: "booking", ...extra }) }); }
beforeEach(() => { state.user = "owner"; state.owner = "owner"; state.update.mockClear(); vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://invalid.local"); vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test"); });
describe("review display preference", () => {
  it("allows the owner to withdraw permission after the text-edit window", async () => {
    expect((await PATCH(request({ publicDisplayConsent: false }))).status).toBe(200);
    expect(state.update).toHaveBeenCalledWith({ public_display_consent: false, public_name_consent: false, public_area_consent: false, public_service_consent: false });
  });
  it("allows the owner to opt in later without changing the rating or text", async () => {
    expect((await PATCH(request({ publicDisplayConsent: true }))).status).toBe(200);
    expect(state.update).toHaveBeenCalledWith({ public_display_consent: true });
  });
  it("rejects someone else's preference changes", async () => {
    state.user = "other";
    expect((await PATCH(request({ publicDisplayConsent: false }))).status).toBe(403);
    expect(state.update).not.toHaveBeenCalled();
  });
  it("preserves the 24-hour restriction on text edits", async () => {
    expect((await PATCH(request({ comment: "Changed" }))).status).toBe(400);
    expect(state.update).not.toHaveBeenCalled();
  });
  it("rejects string-valued consent", async () => {
    expect((await PATCH(request({ publicDisplayConsent: "false" }))).status).toBe(400);
    expect(state.update).not.toHaveBeenCalled();
  });
});

describe("review detail preferences", () => {
  it("allows individual withdrawal beyond the text-edit window", async () => {
    expect((await PATCH(request({ publicNameConsent: false }))).status).toBe(200);
    expect(state.update).toHaveBeenCalledWith({ public_name_consent: false });
  });
  it("preserves independent explicit choices", async () => {
    expect((await PATCH(request({ publicNameConsent: true, publicAreaConsent: false, publicServiceConsent: true }))).status).toBe(200);
    expect(state.update).toHaveBeenCalledWith({ public_name_consent: true, public_area_consent: false, public_service_consent: true });
  });
  it("rejects malformed detail choices and other reviewers", async () => {
    expect((await PATCH(request({ publicAreaConsent: "true" }))).status).toBe(400);
    state.user="other";
    expect((await PATCH(request({ publicNameConsent: true }))).status).toBe(403);
    expect(state.update).not.toHaveBeenCalled();
  });
});
