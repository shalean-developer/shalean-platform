import { createHmac } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ insert: vi.fn(), preference: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ from: (table: string) => {
  if (table !== "email_delivery_events") throw Error("Unexpected webhook write");
  return { insert: m.insert };
} }) }));
vi.mock("@/lib/email/providerPreferenceWebhook", () => ({ applyProviderPreferenceWithdrawal: m.preference }));
// The real installed Resend SDK verifies signatures; no verifier mock.
import { POST } from "../route";
const key = Buffer.from("synthetic-webhook-secret-32-bytes-minimum");
const secret = "whsec_" + key.toString("base64");
const payload = JSON.stringify({ type: "contact.updated", data: { email: "synthetic@example.test", unsubscribed: true } });
function signed(body = payload, timestamp = String(Math.floor(Date.now()/1000)), signedBody = body) {
  const id = "synthetic-signed-event";
  const signature = createHmac("sha256", key).update(`${id}.${timestamp}.${signedBody}`).digest("base64");
  return new Request("https://example.test/api/webhooks/resend", { method: "POST", body, headers: {
    "svix-id": id, "svix-timestamp": timestamp, "svix-signature": "v1," + signature,
  } });
}
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://synthetic.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "synthetic-private-key"); vi.stubEnv("RESEND_API_KEY", "re_synthetic_test"); vi.stubEnv("RESEND_WEBHOOK_SECRET", secret);
  vi.stubGlobal("fetch", vi.fn(() => { throw Error("Webhook verification must not contact a provider"); }));
  m.insert.mockResolvedValue({ error: null }); m.preference.mockResolvedValue({ ok: true });
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
it("accepts the exact signed raw payload without provider network", async () => {
  expect((await POST(signed())).status).toBe(200); expect(m.insert).toHaveBeenCalledOnce(); expect(m.preference).toHaveBeenCalledOnce(); expect(fetch).not.toHaveBeenCalled();
});
it("rejects modified raw bytes and expired signatures before writes", async () => {
  expect((await POST(signed(payload + " ", undefined, payload))).status).toBe(400);
  expect((await POST(signed(payload, String(Math.floor(Date.now()/1000) - 86400)))).status).toBe(400);
  expect(m.insert).not.toHaveBeenCalled(); expect(m.preference).not.toHaveBeenCalled();
});
it("a signed duplicate is acknowledged only after atomic preference recovery succeeds", async () => {
  m.preference.mockResolvedValueOnce({ ok: false, reason: "provider_consent_transaction_failed" });
  expect((await POST(signed())).status).toBe(500);
  m.insert.mockResolvedValue({ error: { code: "23505" } });
  const retry = await POST(signed()); expect(retry.status).toBe(200); expect(await retry.json()).toMatchObject({ duplicate: true }); expect(m.preference).toHaveBeenCalledTimes(2);
});
