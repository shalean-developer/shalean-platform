import { test } from "node:test";
import assert from "node:assert/strict";
import { summarizeEnvironment } from "./audit03a02b2PleskEnvPreflight.mjs";

test("missing variables report false and never expose values", () => {
  const report = JSON.stringify(summarizeEnvironment({ ZOHO_REFRESH_TOKEN: "SECRET_DO_NOT_LOG" }));
  assert.match(report, /"ZOHO_REFRESH_TOKEN":true/);
  assert.doesNotMatch(report, /SECRET_DO_NOT_LOG/);
  assert.match(report, /"networkCalls":0/);
  assert.match(report, /"writes":0/);
});

test("exact staging reference and org are required", () => {
  const ok = summarizeEnvironment({
    SHALEAN_APP_ENV: "staging",
    NEXT_PUBLIC_SUPABASE_URL: "https://uwvnmluiqbczeduzjgse.supabase.co",
    ZOHO_ORGANIZATION_ID: "927500285",
  });
  assert.equal(ok.stagingEnvironment, true);
  assert.equal(ok.stagingSupabaseMatch, true);
  assert.equal(ok.zohoOrgMatch, true);
  const prod = summarizeEnvironment({
    SHALEAN_APP_ENV: "production",
    NEXT_PUBLIC_SUPABASE_URL: "https://paqjwfulwywtsyyvdxrq.supabase.co",
    ZOHO_ORGANIZATION_ID: "927500285",
  });
  assert.equal(prod.stagingEnvironment, false);
  assert.equal(prod.stagingSupabaseMatch, false);
});
