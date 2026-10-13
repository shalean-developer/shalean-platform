import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const helper=readFileSync(new URL("./auditZohoCleanerSettlements03a02b2.ts",import.meta.url),"utf8");
const ci=readFileSync(new URL("../../.github/workflows/web-test.yml",import.meta.url),"utf8");
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
