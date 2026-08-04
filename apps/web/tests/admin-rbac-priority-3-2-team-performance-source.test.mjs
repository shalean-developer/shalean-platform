import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const route = await readFile(new URL("../app/api/admin/team-performance/route.ts", import.meta.url), "utf8");
const page = await readFile(new URL("../app/(ui-redesign)/office/cleaner-performance/page.tsx", import.meta.url), "utf8");

assert.match(route, /scope\.roles\.includes\("supervisor"\)/, "Supervisor scope must be resolved explicitly");
assert.match(route, /scope\.teams\.length !== 1/, "Supervisor must have exactly one assigned team");
assert.match(route, /workforce\.cleaner_earnings\.view/, "Cleaner earnings require the dedicated permission");
assert.match(route, /activeOnDate\(row, today\)/, "Only memberships active on the reporting date may be counted");
assert.match(route, /REPORTING_LOOKBACK_DAYS = 30/, "Completed bookings require a historical reporting window");
assert.match(route, /booking\.date >= historyFromYmd/, "Completed bookings must be constrained to the historical window");
assert.match(route, /reportingWindow/, "API must disclose its reporting window to the UI");
assert.doesNotMatch(route, /total_paid_zar|amount_paid_cents|company_revenue|profit|invoice_total/, "Team performance API must not expose customer revenue or company finance");
assert.match(page, /Customer revenue and company-wide finance remain hidden/, "Supervisor UI must state its finance boundary");
assert.match(page, /supervisorName/, "Team performance must display the accountable supervisor");

console.log("P3.2 team performance source contract: PASS");
