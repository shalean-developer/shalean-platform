import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { acceptanceMessageId, sendMarketingAcceptance } from "../sendMarketingAcceptance";
import { POST } from "@/app/api/admin/email/acceptance/send/route";
import { marketingAcceptanceSendEnabled } from "../marketingAcceptanceConfig";
const m = vi.hoisted(() => ({ gate: vi.fn(), send: vi.fn(), auth: vi.fn(), admin: vi.fn(), identity: vi.fn() }));
vi.mock("@/lib/email/marketingSendGate", () => ({ checkMarketingSendGate: m.gate }));
vi.mock("@/lib/email/resendFrom", () => ({ getResend: () => ({ emails: { send: m.send } }), getDefaultFromAddress: () => "Shalean <hello@shalean.co.za>" }));
vi.mock("@/lib/auth/requireAdminApi", () => ({ requireAdminApi: m.auth }));
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: m.admin }));
const email = "first@example.test", other = "second@example.test", id = "6b891181-1822-44ee-b713-24b213db540a";
let generation: number, reservationFailure: boolean, trackingFailure: boolean;
let rows: Map<string, Record<string, unknown>>;
function database() {
  return { auth: { admin: { getUserById: m.identity } }, from: (table: string) => {
    let selectedId = "";
    const q = {
      select: () => q,
      eq: (_key: string, value: string) => { selectedId = value; return q; },
      maybeSingle: async () => ({ error: null, data: table === "user_profiles" ? { id, role: "customer", billing_email: email, marketing_consent_generation: generation } : rows.get(selectedId) ?? null }),
      insert: async (row: Record<string, unknown>) => {
        if (reservationFailure) return { error: { code: "unavailable" } };
        if (rows.has(String(row.id))) return { error: { code: "23505" } };
        rows.set(String(row.id), { ...row }); return { error: null };
      },
      update: (patch: Record<string, unknown>) => ({ eq: async (_key: string, key: string) => {
        if (trackingFailure && patch.resend_email_id) return { error: { message: "unavailable" } };
        rows.set(key, { ...rows.get(key), ...patch }); return { error: null };
      } }),
    };
    return q;
  } };
}
beforeEach(() => {
  vi.clearAllMocks(); generation = 3; rows = new Map(); reservationFailure = false; trackingFailure = false;
  for (const [key, value] of Object.entries({ SHALEAN_APP_ENV: "staging", NEXT_PUBLIC_SUPABASE_URL: "https://uwvnmluiqbczeduzjgse.supabase.co", MARKETING_ACCEPTANCE_EMAIL_ALLOWLIST: `${email},${other}`, MARKETING_ACCEPTANCE_SEND_ENABLED: "true", OUTBOUND_MESSAGING_DISABLED: "true", RESEND_CONTACT_WRITES_DISABLED: "true", RESEND_STAGING_WEBHOOK_SECRET: "synthetic", MARKETING_UNSUBSCRIBE_SECRET: "synthetic-test-secret-value-32-characters" })) vi.stubEnv(key, value);
  m.gate.mockResolvedValue({ allowed: true }); m.send.mockResolvedValue({ data: { id: "provider-test" }, error: null });
  m.identity.mockResolvedValue({ data: { user: { email, email_confirmed_at: "2026-11-08" } }, error: null });
  m.auth.mockResolvedValue({ ok: true, userId: "owner" }); m.admin.mockReturnValue(database());
});
afterEach(() => vi.unstubAllEnvs());
const run = () => sendMarketingAcceptance(m.admin(), email);
it.each([
  ["SHALEAN_APP_ENV", "production"], ["NEXT_PUBLIC_SUPABASE_URL", "https://paqjwfulwywtsyyvdxrq.supabase.co"],
  ["MARKETING_ACCEPTANCE_SEND_ENABLED", "false"], ["OUTBOUND_MESSAGING_DISABLED", "false"],
  ["RESEND_CONTACT_WRITES_DISABLED", "false"], ["RESEND_STAGING_WEBHOOK_SECRET", ""], ["MARKETING_UNSUBSCRIBE_SECRET", "short"],
  ["MARKETING_ACCEPTANCE_EMAIL_ALLOWLIST", `${email},${other},third@example.test`],
])("refuses an unsafe capability configuration: %s", async (key, value) => {
  vi.stubEnv(key, value); expect(marketingAcceptanceSendEnabled()).toBe(false);
  expect((await run()).status).toBe(403); expect(m.send).not.toHaveBeenCalled(); expect(rows.size).toBe(0);
});
it("never accepts another recipient", async () => { expect((await sendMarketingAcceptance(m.admin(), "outside@example.test")).status).toBe(403); expect(m.send).not.toHaveBeenCalled(); });
it.each(["test", "production"])("blocks allowlisted seed addresses before reservation in NODE_ENV=%s", async nodeEnv => {
  vi.stubEnv("NODE_ENV", nodeEnv);
  const seed = "customer.one@example.com";
  vi.stubEnv("MARKETING_ACCEPTANCE_EMAIL_ALLOWLIST", `${seed},${other}`);
  m.identity.mockResolvedValue({ data: { user: { email: seed, email_confirmed_at: "2026-11-08" } }, error: null });
  expect((await sendMarketingAcceptance(m.admin(), seed)).status).toBe(403);
  expect(rows.size).toBe(0); expect(m.identity).not.toHaveBeenCalled();
  expect(m.gate).not.toHaveBeenCalled(); expect(m.send).not.toHaveBeenCalled();
});
it.each(["unsubscribed", "suppressed", "no_affirmative_consent", "unverified_preferences", "eligibility_lookup_failed"])("preserves marketing denial: %s", async reason => {
  m.gate.mockResolvedValue({ allowed: false, reason }); expect((await run()).status).toBe(409); expect(rows.size).toBe(0); expect(m.send).not.toHaveBeenCalled();
});
it("checks confirmed customer identity before provider use", async () => { m.identity.mockResolvedValue({ data: { user: { email: other, email_confirmed_at: "2026-11-08" } }, error: null }); expect((await run()).status).toBe(409); expect(m.gate).not.toHaveBeenCalled(); expect(m.send).not.toHaveBeenCalled(); });
it("fails closed when reservation storage is unavailable", async () => { reservationFailure = true; expect((await run()).status).toBe(503); expect(m.send).not.toHaveBeenCalled(); });
it("submits once across concurrent clicks with a stable idempotency key and staging-only links", async () => {
  const results = await Promise.all([run(), run(), run()]);
  expect(results.map(r => r.outcome).sort()).toEqual(["accepted", "already_requested", "already_requested"]);
  expect(m.send).toHaveBeenCalledTimes(1); expect(rows.size).toBe(1);
  const [payload, options] = m.send.mock.calls[0]!;
  expect(payload.to).toBe(email); expect(payload.html).toContain('lang="en"'); expect(payload.text).toContain("https://pricing-test.shalean.co.za/account/profile");
  expect(payload.headers["List-Unsubscribe"]).toMatch(/^<https:\/\/pricing-test.shalean.co.za\/api\/marketing\/unsubscribe\?token=/);
  expect(payload.tags).toContainEqual({ name: "shalean_environment", value: "staging" });
  expect(options.idempotencyKey).toBe(`staging-acceptance/${acceptanceMessageId(id, generation)}`);
  expect([...rows.values()][0]).toMatchObject({ resend_email_id: "provider-test", retry_status: "blocked", delivery_status: "sent" });
});
it("does not send if generation changes after reservation", async () => {
  m.gate.mockImplementation(async () => { generation++; return { allowed: true }; });
  expect((await run()).status).toBe(409); expect(m.send).not.toHaveBeenCalled();
  expect([...rows.values()][0]).toMatchObject({ retry_status: "blocked", delivery_status: "cancelled" });
});
it("does not send if consent is withdrawn after reservation", async () => {
  m.gate.mockResolvedValueOnce({ allowed: true }).mockResolvedValueOnce({ allowed: false, reason: "unsubscribed" });
  expect((await run()).status).toBe(409); expect(m.send).not.toHaveBeenCalled();
});
it("reports provider acceptance even if tracking fails, and never re-sends", async () => {
  trackingFailure = true; expect((await run()).outcome).toBe("accepted_tracking_review");
  expect((await run()).outcome).toBe("already_requested"); expect(m.send).toHaveBeenCalledTimes(1);
});
it("keeps unknown provider outcomes out of automatic retry", async () => {
  m.send.mockRejectedValue(new Error("timeout")); expect((await run()).outcome).toBe("submission_unknown");
  expect((await run()).outcome).toBe("already_requested"); expect(m.send).toHaveBeenCalledTimes(1);
  expect([...rows.values()][0]).toMatchObject({ retry_status: "blocked", delivery_status: "submission_unknown" });
});
it("records provider errors without queueing or repeating delivery", async () => {
  m.send.mockResolvedValue({ data: null, error: { message: "rejected" } }); expect((await run()).status).toBe(502);
  expect((await run()).outcome).toBe("already_requested"); expect(m.send).toHaveBeenCalledTimes(1);
});
it("allows a new explicitly subscribed generation without reusing the old delivery key", async () => {
  await run(); generation++; await run(); expect(m.send).toHaveBeenCalledTimes(2);
  expect(m.send.mock.calls[0]![1]).not.toEqual(m.send.mock.calls[1]![1]);
});
function request(body: unknown = { email, explicitTestSend: true }, headers: Record<string, string> = {}) {
  return new Request("https://pricing-test.shalean.co.za/api/admin/email/acceptance/send", { method: "POST", headers: { "content-type": "application/json", origin: "https://pricing-test.shalean.co.za", ...headers }, body: JSON.stringify(body) });
}
it.each([401, 403, 503])("preserves Office authorization denial %s", async status => {
  m.auth.mockResolvedValue({ ok: false, status, error: "denied" }); expect((await POST(request())).status).toBe(status); expect(m.admin).not.toHaveBeenCalled();
});
it.each([{ email }, { email, explicitTestSend: false }, { email: "outside@example.test", explicitTestSend: true }, { email, explicitTestSend: true, html: "arbitrary" }, [email], null])("rejects unsigned or caller-defined payload %#", async body => { expect((await POST(request(body))).status).toBe(400); expect(m.send).not.toHaveBeenCalled(); });
it("rejects cross-origin requests", async () => { expect((await POST(request(undefined, { origin: "https://other.example.test" }))).status).toBe(403); expect(m.send).not.toHaveBeenCalled(); });
it("limits request bodies before processing", async () => { expect((await POST(request({ email: "x".repeat(2048), explicitTestSend: true }))).status).toBe(413); expect(m.send).not.toHaveBeenCalled(); });
it("supports the actual Plesk listener URL using its canonical Host", async () => {
  const r = request(); const req = new Request("http://127.0.0.1:3000/api/admin/email/acceptance/send", { method: "POST", headers: { ...Object.fromEntries(r.headers), host: "pricing-test.shalean.co.za" }, body: await r.text() });
  expect((await POST(req)).status).toBe(202); expect(m.auth).toHaveBeenCalledWith(expect.any(Request), ["system.settings"]);
});
