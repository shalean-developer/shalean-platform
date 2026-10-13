import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const helper=readFileSync(new URL("./auditZohoCleanerSettlements03a02b2.ts",import.meta.url),"utf8");
const ci=readFileSync(new URL("../../../.github/workflows/web-test.yml",import.meta.url),"utf8");
test("No remotely repeatable financial audit route or HTTP feature toggle",()=>{
 assert.doesNotMatch(helper,/AUDIT_03A02B2_HTTP_ENABLED/);
 assert.match(helper,/AUDIT_03A02B2_READ_ONLY !== "YES"/);
 assert.match(helper,/snapshotError/);
 assert.match(helper,/ledgerError/);
 assert.match(helper,/cleaner_line_earnings_finalized_at/);
 assert.match(helper,/payout_paid_at/);
 assert.match(helper,/payout_run_id/);
 assert.match(helper,/earnings_summary/);
 assert.match(helper,/snapshot no longer converges/);
 assert.doesNotMatch(helper,/\.insert\(|\.update\(|\.delete\(|\.upsert\(/);
 assert.doesNotMatch(ci,/audit03a02b2ProtectedRoute\.contract\.test/);
});

test("no API route imports or references the private audit executor", () => {
 const apiRoot = fileURLToPath(new URL("../app/api/", import.meta.url));
 const forbidden = /auditZohoCleanerSettlements03a02b2|runZohoCleanerSettlementEvidence03a02b2|AUDIT_03A02B2_HTTP_ENABLED|03a02b2-zoho-evidence/i;
 function scan(directory) {
  for (const ent of readdirSync(directory, { withFileTypes: true })) {
   const full = join(directory, ent.name);
   if (ent.isDirectory()) scan(full);
   else if (/\.(tsx?|mjs|jsx?)$/.test(ent.name)) {
    const contents=readFileSync(full, "utf8");
    assert.doesNotMatch(contents, forbidden, `HTTP audit trigger found in ${full}`);
   }
  }
 }
 scan(apiRoot);
});
