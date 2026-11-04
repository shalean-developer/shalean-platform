import { beforeEach,describe,expect,it,vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
const mock=vi.hoisted(()=>({enroll:vi.fn()}));
vi.mock("@/lib/email/syncConsentedMarketingContact",()=>({syncConsentedMarketingContact:mock.enroll}));
import { reconcilePendingMarketingEnrollments } from "../reconcilePendingMarketingEnrollments";

type Job={id:string;customer_id:string;email:string;attempt_count:number};
function fakeDb(jobs:Job[],options:{readError?:boolean;writeError?:boolean}={}){
  const patches:Record<string,unknown>[]=[];
  const admin={from(table:string){
    if(table!=="marketing_email_enrollment_jobs")throw Error("unexpected table");
    return {
      select:()=>({eq:()=>({lte:()=>({order:()=>({limit:async(limit:number)=>({
        data:jobs.slice(0,limit),error:options.readError?{message:"synthetic read failure"}:null,
      })})})})}),
      update:(patch:Record<string,unknown>)=>{
        const state={eq:()=>state,select:()=>({maybeSingle:async()=>{
          patches.push(patch);
          return options.writeError?{data:null,error:{message:"synthetic write failure"}}:{data:{id:"saved"},error:null};
        }})};
        return state;
      },
    };
  }} as unknown as SupabaseClient;
  return {admin,patches};
}
const job:Job={id:"synthetic-job",customer_id:"00000000-0000-4000-8000-000000000777",email:"synthetic@example.test",attempt_count:0};
const run=(db:SupabaseClient)=>reconcilePendingMarketingEnrollments(db,"synthetic-api-key","synthetic-segment");
describe("Gate 3 durable marketing enrollment queue — mock provider only",()=>{
  beforeEach(()=>vi.clearAllMocks());
  it("provider failure retains pending state and schedules retry",async()=>{
    mock.enroll.mockResolvedValue("retry_required");
    const q=fakeDb([job]);const r=await run(q.admin);
    expect(r).toEqual({attempted:1,completed:0,blocked:0,deferred:1});
    expect(q.patches[0]).toMatchObject({status:"pending",attempt_count:1,last_error:"provider_retry_required"});
    expect(new Date(String(q.patches[0]?.next_attempt_at)).getTime()).toBeGreaterThan(Date.now());
  });
  it("later successful retry completes durable enrollment",async()=>{
    mock.enroll.mockResolvedValue("created");
    const q=fakeDb([{...job,attempt_count:1}]);const r=await run(q.admin);
    expect(r).toMatchObject({completed:1,deferred:0});
    expect(q.patches[0]).toMatchObject({status:"completed",attempt_count:2,last_error:null});
  });
  it("withdrawal before retry is blocked by fresh consent check",async()=>{
    mock.enroll.mockResolvedValue("blocked");
    const q=fakeDb([job]);const r=await run(q.admin);
    expect(r).toMatchObject({blocked:1,completed:0});
    expect(q.patches[0]).toMatchObject({status:"blocked",last_error:"eligibility_blocked"});
  });
  it("existing provider membership is idempotently reconciled",async()=>{
    mock.enroll.mockResolvedValue("already_subscribed");
    const q=fakeDb([job]);await run(q.admin);
    expect(q.patches[0]?.status).toBe("completed");
  });
  it("queue storage failures never claim success",async()=>{
    mock.enroll.mockResolvedValue("created");
    const q=fakeDb([job],{writeError:true});
    await expect(run(q.admin)).rejects.toThrow("Cannot persist marketing enrollment outcome");
  });
  it("queue fetch failure performs no provider call",async()=>{
    const q=fakeDb([],{readError:true});
    await expect(run(q.admin)).rejects.toThrow("Cannot load pending marketing enrollments");
    expect(mock.enroll).not.toHaveBeenCalled();
  });
  it("each run limits pending enrollments to 20",async()=>{
    mock.enroll.mockResolvedValue("blocked");
    const q=fakeDb(Array.from({length:25},(_,i)=>({...job,id:String(i)})));
    const r=await run(q.admin);
    expect(r.attempted).toBe(20);
    expect(mock.enroll).toHaveBeenCalledTimes(20);
  });
});
