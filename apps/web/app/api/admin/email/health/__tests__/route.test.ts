import { afterEach, beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ auth: vi.fn(), key: vi.fn() }));
vi.mock("@/lib/auth/requireAdminApi", () => ({ requireAdminApi: m.auth }));
vi.mock("@/lib/email/resendFrom", () => ({ resolveResendApiKey: m.key, getDefaultFromAddress: () => "Shalean <notices@example.test>" }));
import { GET } from "../route";
beforeEach(() => { m.auth.mockResolvedValue({ ok: true }); m.key.mockReturnValue("synthetic-private-key-never-exposed"); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it("an authorized health GET never calls a provider or exposes key material", async () => {
  const network = vi.fn(() => { throw Error("Health must not send or read provider data"); });
  vi.stubGlobal("fetch", network); vi.stubEnv("SHALEAN_APP_ENV", "staging");
  vi.stubEnv("OUTBOUND_MESSAGING_DISABLED", "true");
  const response = await GET(new Request("https://example.test/api/admin/email/health"));
  const body = await response.json();
  expect(body).toMatchObject({ configured: true, outboundDisabled: true, providerWritesDisabled: true, sendProbe: { skipped: true } });
  expect(JSON.stringify(body)).not.toContain("synthetic-private-key");
  expect(body).not.toHaveProperty("keyPrefix"); expect(body).not.toHaveProperty("keyLength");
  expect(network).not.toHaveBeenCalled(); expect(response.headers.get("cache-control")).toBe("no-store");
});
it("denies health access before inspecting configuration", async () => {
  m.auth.mockResolvedValue({ ok: false, status: 403, error: "Forbidden" }); m.key.mockClear();
  expect((await GET(new Request("https://example.test"))).status).toBe(403); expect(m.key).not.toHaveBeenCalled();
});
