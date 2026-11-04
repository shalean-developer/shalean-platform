import { test } from "vitest";
import { strict as assert } from "node:assert";
import {
  createMarketingUnsubscribeToken, createMarketingUnsubscribeUrl, verifyMarketingUnsubscribeToken,
} from "../marketingUnsubscribeToken";

const id = "d36caef9-5573-4331-8d0a-b23d1ac22572";
const secret = "test-only-32-character-secret-not-for-production";
test("signed token verifies correct user identity", () => {
  const token = createMarketingUnsubscribeToken(id, secret, 1000)!;
  assert.deepEqual(verifyMarketingUnsubscribeToken(token, secret, 1001), { customerId: id });
});
test("invalid signature and changed subject rejected", () => {
  const token = createMarketingUnsubscribeToken(id, secret, 1000)!;
  assert.equal(verifyMarketingUnsubscribeToken(token.slice(0,-1)+"A", secret, 1001), null);
  assert.equal(verifyMarketingUnsubscribeToken(token, secret+"different", 1001), null);
});
test("expired token rejected", () => {
  const token = createMarketingUnsubscribeToken(id, secret, 1000)!;
  assert.equal(verifyMarketingUnsubscribeToken(token, secret, 1000+91*86400), null);
});
test("untrusted future expiry rejected", () => {
  const token = createMarketingUnsubscribeToken(id, secret, 1000)!;
  assert.equal(verifyMarketingUnsubscribeToken(token, secret, 0), null);
});
test("invalid UUID and weak secret reject token creation", () => {
  assert.equal(createMarketingUnsubscribeToken("not-a-uuid",secret), null);
  assert.equal(createMarketingUnsubscribeToken(id,"too-short"), null);
});
test("marketing unsubscribe links require HTTPS", () => {
  assert.equal(createMarketingUnsubscribeUrl("http://localhost:3000",id,secret),null);
  assert.ok(createMarketingUnsubscribeUrl("https://shalean.co.za",id,secret)?.startsWith("https://shalean.co.za/api/marketing/unsubscribe?token="));
});
test("empty and malformed signatures fail safely", () => {
  assert.equal(verifyMarketingUnsubscribeToken("not.token",secret),null);
  assert.equal(verifyMarketingUnsubscribeToken("",secret),null);
});
