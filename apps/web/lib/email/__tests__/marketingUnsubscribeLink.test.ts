import { expect, test } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createCustomerMarketingUnsubscribeUrl } from "../marketingUnsubscribeLink";
import { verifyMarketingUnsubscribeToken } from "../marketingUnsubscribeToken";
const id="00000000-0000-4000-8000-000000000777", email="synthetic@example.test";
const secret="synthetic-secret-with-at-least-32-characters";
function db(generation:unknown=4, role="customer", billing=email, error:unknown=null) {
  return {from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{role,billing_email:billing,marketing_consent_generation:generation},error})})})})} as unknown as SupabaseClient;
}
test("issuance embeds database generation, not a caller-controlled default",async()=>{
  const url=await createCustomerMarketingUnsubscribeUrl(db(),"https://shalean.co.za",id,email,secret);
  expect(verifyMarketingUnsubscribeToken(new URL(url!).searchParams.get('token')!,secret))
    .toEqual({customerId:id,version:2,generation:4});
});
test.each([null,undefined,-1,0.5,"4",2147483648])("missing/invalid generation %s fails closed",async generation=>{
  const client= generation===undefined ? db(null) : db(generation);
  expect(await createCustomerMarketingUnsubscribeUrl(client,"https://shalean.co.za",id,email,secret)).toBeNull();
});
test("issuance rejects identity mismatches and database failures",async()=>{
  for(const client of [db(4,"admin"),db(4,"customer","other@example.test"),db(4,"customer",email,{message:'unavailable'}),null])
    expect(await createCustomerMarketingUnsubscribeUrl(client,"https://shalean.co.za",id,email,secret)).toBeNull();
});
