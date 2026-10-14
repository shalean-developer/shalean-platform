import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const root = resolve(process.cwd(), '../..');
describe('governed seed booking timeline',()=>{
 it('validates all 15 actual fixtures without credentials or database access',()=>{
  const result=JSON.parse(execFileSync(process.execPath,[resolve(root,'scripts/seed-dev.mjs'),'--validate-bookings'],{encoding:'utf8',env:{PATH:process.env.PATH}}));
  expect(result.bookings).toBe(15);
  expect(result.dates).toHaveLength(15);
  expect(result.dates.every((date:string)=>/^\d{4}-\d{2}-\d{2}$/.test(date)&&date>='2026-10-01')).toBe(true);
 });
 it.each(['2026-10-14','2026-11-01','2026-12-01'])('keeps the complete relative timeline forward at %s',async(today)=>{
  const {forwardSeedBookingDate}=await import(pathToFileURL(resolve(root,'scripts/lib/forwardSeedBookingDate.mjs')).href);
  const dates=[-42,-30,-21,-14,-7,-3,0,3,10].map(offset=>forwardSeedBookingDate(offset,new Date(today+'T12:00:00Z')));
  expect(dates.every(date=>date>='2026-10-01')).toBe(true);
  const first=Date.parse(dates[0]);
  expect((Date.parse(dates[8])-first)/86400000).toBe(52);
  // Shift by whole weeks so each scenario retains its weekday relationship.
  expect(new Date(dates[0]+'T12:00:00Z').getUTCDay()).toBe(new Date(Date.parse(today+'T12:00:00Z')-42*86400000).getUTCDay());
 });
});
