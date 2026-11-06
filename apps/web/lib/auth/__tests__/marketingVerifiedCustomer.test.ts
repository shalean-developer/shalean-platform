import { afterEach, beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ getUser: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ auth: { getUser: m.getUser } }) }));
import { requireCustomerSession } from "../customerBearer";
beforeEach(() => { vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://synthetic.supabase.co"); vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "synthetic-public-key"); m.getUser.mockReset(); });
afterEach(() => vi.unstubAllEnvs());
const request = () => new Request("https://example.test", { headers: { Authorization: "Bearer synthetic-session" } });
it("marketing rejects an unconfirmed email even with a valid auth session", async () => {
  m.getUser.mockResolvedValue({ data: { user: { id: "synthetic", email: "synthetic@example.test", email_confirmed_at: null } }, error: null });
  const result = await requireCustomerSession(request(), { requireVerifiedEmail: true });
  expect(result.ok).toBe(false); if (!result.ok) expect(result.response.status).toBe(403);
});
it("accepts a server-verified confirmed identity", async () => {
  m.getUser.mockResolvedValue({ data: { user: { id: "synthetic", email: "synthetic@example.test", email_confirmed_at: "2026-11-01T00:00:00Z" } }, error: null });
  expect(await requireCustomerSession(request(), { requireVerifiedEmail: true })).toMatchObject({ ok: true, session: { userId: "synthetic" } });
});
it("preserves existing non-marketing callers and denies missing bearer tokens", async () => {
  m.getUser.mockResolvedValue({ data: { user: { id: "synthetic", email: "synthetic@example.test" } }, error: null });
  expect((await requireCustomerSession(request())).ok).toBe(true);
  const missing = await requireCustomerSession(new Request("https://example.test"), { requireVerifiedEmail: true });
  expect(missing.ok).toBe(false); if (!missing.ok) expect(missing.response.status).toBe(401);
});
it("never trusts a caller's forged bearer value without getUser verification", async () => {
  m.getUser.mockResolvedValue({ data: { user: null }, error: { message: "invalid" } });
  expect((await requireCustomerSession(request(), { requireVerifiedEmail: true })).ok).toBe(false);
});
