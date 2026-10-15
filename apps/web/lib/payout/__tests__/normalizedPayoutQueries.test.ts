import {describe,it,expect,vi} from 'vitest';
import {backfillLegacyWeeklyPayoutColumnsFromEarnings,countCompletedBlockingMissingLegacyPayout} from '@/lib/payout/backfillLegacyWeeklyPayoutColumns';
function database(){
 const rows=[{id:'a',date:'2026-09-30',cleaner_id:'cleaner',display_earnings_cents:100,cleaner_payout_cents:null},{id:'b',date:' 2026-10-02 ',cleaner_id:'cleaner',display_earnings_cents:200,cleaner_payout_cents:null},{id:'c',date:null,cleaner_id:'cleaner',display_earnings_cents:300,cleaner_payout_cents:null}];
 const writes:string[]=[];
 return {rows,writes,from:()=>{
  let id:string|null=null;let patch:object|null=null;let cursor='';
  const q={select:()=>q,eq:(column:string,value:string)=>{if(column==='id')id=value;return q;},is:()=>q,order:()=>q,gt:(_c:string,value:string)=>{cursor=value;return q;},limit:()=>q,range:()=>q,
   gte:()=>{throw Error('raw text date filter');},update:(value:object)=>{patch=value;return q;},
   then:(done:(result:unknown)=>unknown)=>{if(patch&&id){writes.push(id);Object.assign(rows.find(row=>row.id===id)!,patch);}return Promise.resolve({data:rows.filter(row=>row.id>cursor),error:null}).then(done);}};return q;
 }};
}
describe('normalized payout query dates',()=>{
 it('backfills padded forward visits while preserving historical and undated rows',async()=>{
  const db=database();expect(await backfillLegacyWeeklyPayoutColumnsFromEarnings(db as never)).toMatchObject({fixed:1});
  expect(db.writes).toEqual(['b']);expect(db.rows[0].cleaner_payout_cents).toBeNull();expect(db.rows[2].cleaner_payout_cents).toBeNull();
 });
 it('counts only current missing legacy payouts using normalized dates',async()=>{
  expect(await countCompletedBlockingMissingLegacyPayout(database() as never)).toEqual({count:1,bookingIds:['b']});
 });
});
