/** Plan-only renderer for two allowlisted, disjoint synthetic staging cases. */
import { readFileSync } from 'node:fs';

const cases = {
  r252: [],
  r280: [
    ['96310000', '96320000'],
    ['AUDIT963-PREVIEW-LINE-BASIS', 'AUDIT963-PREVIEW-LINE-BASIS-R280'],
    ['audit963.customer@example.com', 'audit963.r280@example.com'],
    ['Audit963 Synthetic Customer', 'Audit963 R280 Synthetic Customer'],
    ['2027-03-16', '2027-03-17'],
    ['16 March 2027', '17 March 2027'],
    ['R360', 'R400'], ['R252', 'R280'],
    ['36000', '40000'], ['25200', '28000'], ['10800', '12000'],
    ['total_paid_zar=360', 'total_paid_zar=400'],
    ["0,360,'ZAR'", "0,400,'ZAR'"],
    ['"base_price":360', '"base_price":400'],
    ['"total_price":360', '"total_price":400'],
  ],
};
const scenario = process.argv[2] ?? 'r252';
if (!Object.hasOwn(cases, scenario)) throw new Error('Choose r252 or r280');
let sql = readFileSync(new URL('./office-preview-solo-fixture.sql', import.meta.url), 'utf8');
for (const [from, to] of cases[scenario]) {
  if (!sql.includes(from)) throw new Error('Reviewed fixture template changed');
  sql = sql.split(from).join(to);
}
if (!sql.endsWith('\nROLLBACK;\n')) throw new Error('Rollback-first plan required');
// No credentials, network request or database execution. The operator verifies
// fresh staging health/SHA and uses the selected staging connection for rehearsal.
process.stdout.write(sql);
