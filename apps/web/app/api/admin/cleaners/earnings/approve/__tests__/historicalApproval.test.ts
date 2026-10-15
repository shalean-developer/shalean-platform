import {describe,it,expect,vi,beforeEach} from 'vitest';
vi.mock('@/lib/auth/requireAdminApi',()=>({requireAdminApi:vi.fn().mockResolvedValue({ok:true})}));
vi.mock('@/lib/supabase/admin',()=>({getSupabaseAdmin:vi.fn()}));
import {getSupabaseAdmin} from '@/lib/supabase/admin';
import {POST} from '../route';
const id='aaaaaaaa-0000-4000-8000-000000000001';
function mockDb(message:string|null){
 const result={data:message?null:{id,status:'approved'},error:message?{message}:null};
 const q={update:()=>q,eq:()=>q,select:()=>q,maybeSingle:async()=>result,then:(done:(v:unknown)=>unknown)=>Promise.resolve(result).then(done)};
 vi.mocked(getSupabaseAdmin).mockReturnValue({from:()=>q,rpc:async()=>({...result,data:message?null:[result.data]})} as never);
}
describe('historical earnings approval response',()=>{
 beforeEach(()=>vi.clearAllMocks());
 it.each(['earnings_id','booking_id','cleaner_id'])('returns conflict for protected %s approval',async(key)=>{
  mockDb('historical_payout_item_deferred');
  const response=await POST(new Request('https://example.com',{method:'POST',body:JSON.stringify({[key]:id})}));
  expect(response.status).toBe(409);expect(await response.json()).toMatchObject({error:'historical_payout_item_deferred'});
 });
 it('routes cleaner-wide approval through the current-only atomic command',async()=>{
  const rpc=vi.fn().mockResolvedValue({data:[{id,status:'approved'}],error:null});
  vi.mocked(getSupabaseAdmin).mockReturnValue({rpc} as never);
  const response=await POST(new Request('https://example.com',{method:'POST',body:JSON.stringify({cleaner_id:id})}));
  expect(response.status).toBe(200);expect(await response.json()).toMatchObject({approved_count:1});
  expect(rpc).toHaveBeenCalledWith('audit_03c02_approve_current_cleaner_earnings',{p_cleaner_id:id,p_approved_at:expect.any(String)});
 });
 it('preserves database failure status' ,async()=>{
  mockDb('connection failed');expect((await POST(new Request('https://example.com',{method:'POST',body:JSON.stringify({booking_id:id})}))).status).toBe(500);
 });
 it('still approves a valid forward row',async()=>{
  mockDb(null);expect((await POST(new Request('https://example.com',{method:'POST',body:JSON.stringify({booking_id:id})}))).status).toBe(200);
 });
});
