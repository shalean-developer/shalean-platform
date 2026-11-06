import { afterEach, beforeEach, test, vi } from "vitest";
import { strict as assert } from "node:assert";
import { reconcileResendUnsubscribe } from "../reconcileResendUnsubscribe";

beforeEach(()=>{vi.stubEnv("SHALEAN_APP_ENV","production");vi.stubEnv("RESEND_CONTACT_WRITES_DISABLED","false");});
afterEach(()=>vi.unstubAllEnvs());

test("staging never PATCHes a provider contact, even with an API key and write flag", async () => {
  vi.stubEnv("SHALEAN_APP_ENV","staging");
  let calls=0;
  const result=await reconcileResendUnsubscribe("synthetic@example.test",{
    apiKey:"synthetic-api-key",fetchFn:(async()=>{calls++;throw Error("must not call provider");}) as typeof fetch,
  });
  assert.equal(result,"retry_required");
  assert.equal(calls,0);
});
test("missing provider-write opt-in never PATCHes even in production", async () => {
  vi.stubEnv("RESEND_CONTACT_WRITES_DISABLED","true");
  let calls=0;
  const result=await reconcileResendUnsubscribe("synthetic@example.test",{
    apiKey:"synthetic-api-key",fetchFn:(async()=>{calls++;throw Error("must not call provider");}) as typeof fetch,
  });
  assert.equal(result,"retry_required");
  assert.equal(calls,0);
});

test("updates an existing contact using PATCH and unsubscribed true", async () => {
  let calls = 0;
  const result = await reconcileResendUnsubscribe(" SOMEONE@EXAMPLE.COM ", {
    apiKey: "test-key",
    fetchFn: (async (url, init) => {
      calls++;
      assert.equal(url, "https://api.resend.com/contacts/someone%40example.com");
      assert.equal(init?.method, "PATCH");
      assert.deepEqual(JSON.parse(String(init?.body)), { unsubscribed: true });
      return { ok: true, status: 200 } as Response;
    }) as typeof fetch,
  });
  assert.equal(result, "updated");
  assert.equal(calls, 1);
});
test("does not create contact on 404", async () => {
  const result = await reconcileResendUnsubscribe("a@example.com", {
    apiKey: "test-key",
    fetchFn: (async (_url, init) => {
      assert.equal(init?.method, "PATCH");
      return { ok: false, status: 404 } as Response;
    }) as typeof fetch,
  });
  assert.equal(result, "not_found");
});
test("provider error fails safely", async () => {
  const result = await reconcileResendUnsubscribe("a@example.com", {
    apiKey: "test-key",
    fetchFn: (async () => ({ ok: false, status: 503 } as Response)) as typeof fetch,
  });
  assert.equal(result, "retry_required");
});
test("network outage fails safely", async () => {
  const result = await reconcileResendUnsubscribe("a@example.com", {
    apiKey: "test-key",
    fetchFn: (async () => { throw new Error("network down"); }) as typeof fetch,
  });
  assert.equal(result, "retry_required");
});
test("invalid email never makes a provider request", async () => {
  const result = await reconcileResendUnsubscribe("not-an-email", {
    apiKey: "test-key",
    fetchFn: (async () => { throw new Error("should not call"); }) as typeof fetch,
  });
  assert.equal(result, "retry_required");
});

test("provider requests are bounded and timeout remains retryable", async () => {
  const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(AbortSignal.abort(new DOMException("Synthetic timeout", "TimeoutError")));
  try {
    const result = await reconcileResendUnsubscribe("synthetic@example.test", { apiKey: "synthetic", fetchFn: (async (_url, init) => {
      assert.equal(init?.signal?.aborted, true); throw init?.signal?.reason;
    }) as typeof fetch });
    assert.equal(result, "retry_required"); assert.equal(timeout.mock.calls[0]?.[0], 10000);
  } finally { timeout.mockRestore(); }
});
