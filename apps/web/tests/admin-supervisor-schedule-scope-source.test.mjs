import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const route = await readFile(new URL("../app/api/admin/schedule/day/route.ts", import.meta.url), "utf8");

assert.match(route, /getEffectiveAdminScope/, "Schedule day endpoint must resolve effective RBAC scope");
assert.match(route, /scope\.roles\.includes\("supervisor"\)/, "Supervisor role must be handled explicitly");
assert.match(route, /bookingsQuery = bookingsQuery\.eq\("team_id", scope\.teams\[0\]\)/, "Supervisor bookings must be limited to the assigned team");
assert.match(route, /activeTeamCleanerIds/, "Cleaner capacity must use active assigned-team membership");
assert.match(route, /finance\.customer_revenue\.view/, "Schedule finance must require customer-revenue permission");
assert.doesNotMatch(route, /and\(cleaner_id\.is\.null,selected_cleaner_id\.is\.null\).*isSupervisor/s, "Supervisor scope must not include global unassigned bookings");

console.log("Supervisor schedule scope source contract: PASS");
