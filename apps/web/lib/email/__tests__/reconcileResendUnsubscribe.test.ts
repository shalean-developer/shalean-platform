import { test } from "vitest";
import { strict as assert } from "node:assert";
import { reconcileResendUnsubscribe } from "../reconcileResendUnsubscribe";

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
