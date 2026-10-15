import {describe,it,expect,vi} from 'vitest';
import {restoreRecurringPreferredCleanerAssignments} from '@/lib/recurring/restoreRecurringPreferredCleanerAssignments';
describe('normalized recurring restoration selection',()=>{
 it('counts padded forward unassigned rows in scope without raw date predicates',async()=>{
  const rows=[{id:'forward',date:' 2026-10-02 ',recurring_id:null,selected_cleaner_id:null},{id:'old',date:'2026-09-30'},{id:'later',date:'2026-11-01'}];
  const dateFilter=vi.fn(()=>{throw new Error('raw date comparison');});
  const q={select:()=>q,eq:()=>q,is:()=>q,not:()=>q,order:()=>q,range:async()=>({data:rows,error:null}),gte:dateFilter,lte:dateFilter};
  const result=await restoreRecurringPreferredCleanerAssignments({from:()=>q} as never,{fromDate:'2026-10-01',toDate:'2026-10-31'});
  expect(result).toMatchObject({updated:0,remaining:1});expect(dateFilter).not.toHaveBeenCalled();
 });
 it('assigns a padded current occurrence and clears it from remaining',async()=>{
  let assigned=false;const row={id:'forward',date:' 2026-10-02 ',status:'pending_assignment',recurring_id:null,selected_cleaner_id:'bbbbbbbb-0000-4000-8000-000000000001'};
  const q={select:()=>q,eq:()=>q,is:()=>q,not:()=>q,order:()=>q,range:async()=>({data:assigned?[]:[row],error:null}),update:()=>({eq:async()=>{assigned=true;return {error:null};}})};
  expect(await restoreRecurringPreferredCleanerAssignments({from:()=>q} as never)).toMatchObject({updated:1,remaining:0});
 });
 it('surfaces remaining-row lookup failures' ,async()=>{
  let calls=0;const q={select:()=>q,eq:()=>q,is:()=>q,not:()=>q,order:()=>q,range:async()=>++calls===1?{data:[],error:null}:{data:null,error:{message:'count failed'}}};
  await expect(restoreRecurringPreferredCleanerAssignments({from:()=>q} as never)).rejects.toThrow('count failed');
 });
});
