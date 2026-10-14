import { describe, expect, it, vi } from 'vitest';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
const root=resolve(process.cwd(),'../..');
const moduleAt=(path:string)=>import(pathToFileURL(resolve(root,path)).href);
describe('governed seed upgrade without historical mutation',()=>{
 it('uses disjoint forward booking IDs and references in the actual seed builder',()=>{
  const p=JSON.parse(execFileSync(process.execPath,[resolve(root,'scripts/seed-dev.mjs'),'--validate-bookings'],{encoding:'utf8',env:{NODE_ENV:'test',PATH:process.env.PATH}}));
  expect(p.ids).toHaveLength(15);expect(new Set(p.ids).size).toBe(15);
  expect(p.ids.every((id:string)=>id.startsWith('f2000002-'))).toBe(true);
  expect(p.references.every((ref:string)=>ref.startsWith('DEVSEED-OCT2026-BK-'))).toBe(true);
 });
 it.each([2,3,4,5,6,7,8])('separates financial fixture kind %s from legacy IDs',async(kind)=>{
  const {forwardSeedFixtureId}=await moduleAt('scripts/lib/seedFixtureGeneration.mjs');
  const old=`f${kind}000001-0001-4002-8002-000000000001`;
  expect(forwardSeedFixtureId(old)).toBe(old.replace('000001-','000002-'));
 });
 it('retains every existing forward fixture date before reseeding',async()=>{
  const {seedBookings}=await moduleAt('scripts/seed-dev.mjs');
  const writes:{id:string,date:string}[]=[];
  const stored=Array.from({length:15},(_,i)=>({id:`f2000002-${String(i+1).padStart(4,'0')}-4002-8002-${String(i+1).padStart(12,'0')}`,date:'2026-10-07'}));
  const db={from:()=>({select:()=>({in:async()=>({data:stored,error:null})}),upsert:async(row:{id:string,date:string})=>{writes.push(row);return {error:null};}})};
  expect((await seedBookings(db,{},{})).count).toBe(15);
  expect(writes).toHaveLength(15);expect(writes.every(row=>row.date==='2026-10-07')).toBe(true);
 });
 it('fails before reseeding when stored dates cannot be read',async()=>{
  const {seedBookings}=await moduleAt('scripts/seed-dev.mjs');const upsert=vi.fn();
  const db={from:()=>({select:()=>({in:async()=>({data:null,error:{message:'read failed'}})}),upsert})};
  await expect(seedBookings(db,{},{})).rejects.toThrow('read failed');expect(upsert).not.toHaveBeenCalled();
 });
 it.each([true,false])('preserves shared cleaner tenure on reseed: existing=%s',async(existing)=>{
  const {upsertSeedCleaner}=await moduleAt('scripts/seed-dev.mjs');const upsert=vi.fn().mockResolvedValue({error:null});
  const db={from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:existing?{id:'cleaner'}:null,error:null})})}),upsert})};
  await upsertSeedCleaner(db,{id:'cleaner',joined_at:'2026-01-01',full_name:'Fixture'});
  expect(upsert).toHaveBeenCalledWith(existing?{id:'cleaner',full_name:'Fixture'}:{id:'cleaner',joined_at:'2026-01-01',full_name:'Fixture'},{onConflict:'id'});
 });
 it('fails cleaner reseeding on lookup or write errors',async()=>{
  const {upsertSeedCleaner}=await moduleAt('scripts/seed-dev.mjs');const upsert=vi.fn().mockResolvedValue({error:{message:'write failed'}});
  const from=()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:null,error:{message:'read failed'}})})}),upsert});
  await expect(upsertSeedCleaner({from},{id:'c'})).rejects.toThrow('read failed');expect(upsert).not.toHaveBeenCalled();
  await expect(upsertSeedCleaner({from:()=>({...from(),select:()=>({eq:()=>({maybeSingle:async()=>({data:{id:'c'},error:null})})})})},{id:'c'})).rejects.toThrow('write failed');
 });
 it('does not remap arbitrary identities',async()=>{
  const {forwardSeedFixtureId}=await moduleAt('scripts/lib/seedFixtureGeneration.mjs');
  expect(()=>forwardSeedFixtureId('arbitrary-user')).toThrow();
 });
 it('resets only the current generation while retaining legacy rows and shared parents',async()=>{
  const {resetSeedRows}=await moduleAt('scripts/seed-dev.mjs');
  const calls:{table:string,action:string,ids?:string[]}[]=[];
  const legacy={id:'f2000001-0001-4002-8002-000000000001',date:'2026-09-30'};
  const admin={from(table:string){let action='select';let data:unknown[]=[];const q={
   select(){return q;},delete(){action='delete';return q;},update(){action='update';return q;},
   like(_column:string,pattern:string){data=pattern==='DEVSEED-BK-%'?[legacy]:[];return q;},limit(){return q;},
   in(_column:string,ids:string[]){calls.push({table,action,ids});return q;},eq(){calls.push({table,action});return q;},
   then(done:(r:unknown)=>unknown){return Promise.resolve({data,error:null}).then(done);},
  };return q;}};
  await resetSeedRows(admin);
  expect(legacy).toEqual({id:'f2000001-0001-4002-8002-000000000001',date:'2026-09-30'});
  expect(calls.some(c=>['cleaners','teams','team_members'].includes(c.table)&&c.action==='delete')).toBe(false);
  expect(calls.filter(c=>c.action==='delete').every(c=>!c.ids?.includes(legacy.id))).toBe(true);
 });
 it.each([null,'2026-09-30'])('ENV-03 reset retains an older fixture dated %s',async(date)=>{
  const {resetFixtures}=await moduleAt('scripts/env/seed-nonprod.mjs');
  const row={id:'legacy',paystack_reference:'ENV-03-STG-old-pending',date};
  const remove=vi.fn();const rpc=vi.fn();
  const admin={rpc,from:()=>({select:()=>({like:async()=>({data:[row],error:null})}),delete:remove})};
  expect(await resetFixtures(admin,'staging')).toEqual(new Set([row.paystack_reference]));
  expect(remove).not.toHaveBeenCalled();expect(rpc).not.toHaveBeenCalled();
 });
});
