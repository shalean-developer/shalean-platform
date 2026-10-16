import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
vi.mock("@/lib/admin/adminBookingEarningsDisplay",()=>({
  buildAdminEarningsDisplayForBooking:vi.fn(async()=>null),
  computeLiveBookingEarningsSummary:vi.fn(async()=>null),
}));
import { buildBookingEarningsPreview } from "@/lib/admin/buildBookingEarningsPreview";
const id="00000000-0000-4000-8000-000000000001";
function admin(rosterError=false) {
  const from=vi.fn((table:string)=>{
    const result=table==="bookings" ? {data:{id,is_team_job:false,internal_earnings_cents:52500,
      display_earnings_cents:26000,cleaner_earnings_total_cents:52000,earnings_summary:null},error:null}
      : {data:[{cleaner_id:"lead"},{cleaner_id:"member"},{cleaner_id:"member"}],error:rosterError?{message:"unavailable"}:null};
    const query={select:vi.fn(()=>query),eq:vi.fn(()=>query),maybeSingle:vi.fn(async()=>result),
      then:(resolve:(value:unknown)=>unknown)=>Promise.resolve(result).then(resolve)};
    return query;
  });
  return {from} as unknown as SupabaseClient;
}
describe("earnings preview current participant evidence",()=>{
  it("reads the actual distinct roster and internal obligation",async()=>{
    const result=await buildBookingEarningsPreview(admin(),id);
    expect(result.ok).toBe(true);
    if(result.ok) expect(result.preview.current).toMatchObject({roster_cleaner_count:2,internal_earnings_cents:52500});
  });
  it("fails closed when roster evidence cannot be verified",async()=>{
    expect(await buildBookingEarningsPreview(admin(true),id)).toEqual({ok:false,error:"Could not verify booking earnings participants."});
  });
});
