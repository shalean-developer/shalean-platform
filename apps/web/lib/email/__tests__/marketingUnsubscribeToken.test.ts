import { createHmac } from "node:crypto";
import { test } from "vitest";
import { strict as assert } from "node:assert";
import {
  createMarketingUnsubscribeToken, createMarketingUnsubscribeUrl, verifyMarketingUnsubscribeToken,
} from "../marketingUnsubscribeToken";

const id = "d36caef9-5573-4331-8d0a-b23d1ac22572";
const secret = "test-only-32-character-secret-not-for-production";
test("signed token verifies correct user identity", () => {
  const token = createMarketingUnsubscribeToken(id, secret, 3, 1000)!;
  assert.deepEqual(verifyMarketingUnsubscribeToken(token, secret, 1001), { customerId: id, version: 2, generation: 3 });
});
test("invalid signature and changed subject rejected", () => {
  const token = createMarketingUnsubscribeToken(id, secret, 3, 1000)!;
  assert.equal(verifyMarketingUnsubscribeToken(token.slice(0,-1)+"A", secret, 1001), null);
  assert.equal(verifyMarketingUnsubscribeToken(token, secret+"different", 1001), null);
});
test("expired token rejected", () => {
  const token = createMarketingUnsubscribeToken(id, secret, 3, 1000)!;
  assert.equal(verifyMarketingUnsubscribeToken(token, secret, 1000+91*86400), null);
});
test("untrusted future expiry rejected", () => {
  const token = createMarketingUnsubscribeToken(id, secret, 3, 1000)!;
  assert.equal(verifyMarketingUnsubscribeToken(token, secret, 0), null);
});
test("invalid UUID and weak secret reject token creation", () => {
  assert.equal(createMarketingUnsubscribeToken("not-a-uuid",secret,3), null);
  assert.equal(createMarketingUnsubscribeToken(id,"too-short",3), null);
});
test("marketing unsubscribe links require HTTPS", () => {
  assert.equal(createMarketingUnsubscribeUrl("http://localhost:3000",id,secret,3),null);
  assert.ok(createMarketingUnsubscribeUrl("https://shalean.co.za",id,secret,3)?.startsWith("https://shalean.co.za/api/marketing/unsubscribe?token="));
});
test("empty and malformed signatures fail safely", () => {
  assert.equal(verifyMarketingUnsubscribeToken("not.token",secret),null);
  assert.equal(verifyMarketingUnsubscribeToken("",secret),null);
});

function signedPayload(value: unknown) {
  const encoded = Buffer.from(JSON.stringify(value)).toString("base64url");
  return encoded + "." + createHmac("sha256", secret).update(encoded).digest("base64url");
}
test("v1 is identifiable for authenticated confirmation, never a v2 generation", () => {
  assert.deepEqual(verifyMarketingUnsubscribeToken(signedPayload({uid:id,exp:2000,v:1}),secret,1000),
    {customerId:id,version:1,generation:null});
});
test("invalid or missing v2 generation is rejected even with a valid signature", () => {
  for(const gen of [undefined,-1,0.5,"1",2147483648,null])
    assert.equal(verifyMarketingUnsubscribeToken(signedPayload({uid:id,exp:2000,v:2,gen}),secret,1000),null);
});
test("generation tampering fails HMAC verification", () => {
  const token=createMarketingUnsubscribeToken(id,secret,3,1000)!;
  const [encoded,mac]=token.split(".");
  const value=JSON.parse(Buffer.from(encoded!,"base64url").toString());value.gen=4;
  assert.equal(verifyMarketingUnsubscribeToken(Buffer.from(JSON.stringify(value)).toString("base64url")+"."+mac,secret,1000),null);
});
test("issuance fails closed without a valid database generation", () => {
  for(const gen of [-1,NaN,Infinity,0.5,2147483648]) assert.equal(createMarketingUnsubscribeToken(id,secret,gen),null);
});
test("alternate base64url MAC spellings cannot bypass token-hash replay identity",()=>{
  const token=createMarketingUnsubscribeToken(id,secret,3,1000)!;
  const [encoded,mac]=token.split('.');
  const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const index=alphabet.indexOf(mac!.slice(-1));
  for(let bits=1;bits<4;bits++) {
    const alias=mac!.slice(0,-1)+alphabet[index+bits];
    assert.deepEqual(Buffer.from(alias,'base64url'),Buffer.from(mac!,'base64url'));
    assert.equal(verifyMarketingUnsubscribeToken(encoded+'.'+alias,secret,1000),null);
  }
});
