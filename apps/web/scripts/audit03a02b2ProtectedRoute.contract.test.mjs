import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const route = readFileSync(new URL("../app/api/admin/audit/03a02b2-zoho-evidence/route.ts", import.meta.url), "utf8");
const evidence = readFileSync(new URL("./auditZohoCleanerSettlements03a02b2.ts", import.meta.url), "utf8");

test("audit HTTP route is default-disabled, POST-only and RBAC/office-verification gated", () => {
  assert.match(route, /export async function POST/);
  assert.doesNotMatch(route, /export async function GET/);
  assert.match(route, /AUDIT_03A02B2_HTTP_ENABLED !== "YES"/);
  assert.match(route, /requireAdminPermissionFromRequest\(request, "finance.full.view"\)/);
  assert.match(route, /SHALEAN_APP_ENV !== "production"/);
  assert.match(route, /requestUrl.hostname !== "shalean.co.za"/);
  assert.match(route, /Cache-Control": "no-store"/);
  assert.match(route, /READ_ONLY_JUNE_JULY_2026_11_BOOKINGS/);
  assert.doesNotMatch(route, /\.insert\(|\.update\(|\.delete\(|\.upsert\(/);
});

test("evidence is guarded and import does not automatically execute", () => {
  assert.match(evidence, /export async function runZohoCleanerSettlementEvidence03a02b2/);
  assert.match(evidence, /AUDIT_03A02B2_READ_ONLY !== "YES"/);
  assert.match(evidence, /EXPECTED_REF = "paqjwfulwywtsyyvdxrq"/);
  assert.match(evidence, /EXPECTED_ZOHO_ORG = "927500285"/);
  assert.match(evidence, /accountsDomain !== "accounts.zoho.com"/);
  assert.match(evidence, /apiDomain !== "www.zohoapis.com"/);
  assert.match(evidence, /process.argv\[1\]\?\.replace/);
  assert.doesNotMatch(evidence, /\.insert\(|\.update\(|\.delete\(|\.upsert\(/);
});
