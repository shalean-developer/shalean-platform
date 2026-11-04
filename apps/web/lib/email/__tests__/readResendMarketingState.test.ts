import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readResendMarketingState } from "../readResendMarketingState";
const response = (status: number, body?: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
}) as Response;
const mock = (contact: Response, suppression: Response): typeof fetch =>
  (async (url: string | URL | Request) =>
    String(url).includes("/suppressions/") ? suppression : contact) as typeof fetch;

test("verified unsuppressed contact is eligible provider state", async () => {
  const s = await readResendMarketingState("A@example.com", "test", mock(response(200,{unsubscribed:false}),response(404)));
  assert.deepEqual(s,{verified:true,unsubscribed:false,suppressed:false});
});
test("provider unsubscribe remains blocked", async () => {
  const s = await readResendMarketingState("a@example.com","test",mock(response(200,{unsubscribed:true}),response(404)));
  assert.equal(s.unsubscribed,true);
});
test("provider suppression remains blocked", async () => {
  const s = await readResendMarketingState("a@example.com","test",mock(response(200,{unsubscribed:false}),response(200)));
  assert.equal(s.suppressed,true);
});
test("no contact fails closed", async () => {
  const s = await readResendMarketingState("a@example.com","test",mock(response(404),response(404)));
  assert.equal(s.verified,false);
});
test("provider server error fails closed", async () => {
  const s = await readResendMarketingState("a@example.com","test",mock(response(200,{unsubscribed:false}),response(503)));
  assert.equal(s.verified,false);
});
test("malformed contact response fails closed", async () => {
  const s = await readResendMarketingState("a@example.com","test",mock(response(200,{value:false}),response(404)));
  assert.equal(s.verified,false);
});
test("missing API key makes no calls", async () => {
  const s = await readResendMarketingState("a@example.com",undefined,(async()=>{throw new Error("called")}) as typeof fetch);
  assert.equal(s.verified,false);
});
