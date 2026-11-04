import { beforeEach,describe,expect,it,vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
const mock=vi.hoisted(()=>({enroll:vi.fn()}));
vi.mock("@/lib/email/syncConsentedMarketingContact",()=>({syncConsentedMarketingContact:mock.enroll}));
import { reconcilePendingMarketingEnrollments } from "../reconcilePendingMarketingEnrollments";
type Job={id:string;customer_id:string;email:string;attempt_count:number;status:string;
  next_attempt_at:string;claim_token?:string|null;lease_expires_at?:string|null;last_error?:string|null};
const job=(id="one",attempt_count=0):Job=>({id,customer_id:"00000000-0000-4000-8000-000000000777",
  email:"synthetic@example.test",attempt_count,status:"pending",next_attempt_at:"2026-11-01T00:00:00Z"});
function queue(jobs:Job[],opts:{readError?:boolean;writeError?:boolean}={}){
  const rows=jobs.map(x=>({...x}));const patches:Record<string,unknown>[]=[];
  const admin={from(table:string){
    if(table!=="marketing_email_enrollment_jobs")throw Error("unexpected table");
    return {
      select:()=>{
        const predicates:((j:Job)=>boolean)[]=[];
        const chain={
          eq:(key:string,val:unknown)=>{predicates.push(j=>j[key as keyof Job]===val);return chain;},
          lte:(key:string,val:string)=>{predicates.push(j=>String(j[key as keyof Job]??"")<=val);return chain;},
          order:()=>chain,
          limit:async(n:number)=>({data:rows.filter(j=>predicates.every(f=>f(j))).slice(0,n)
            .map(j=>({id:j.id,customer_id:j.customer_id,email:j.email,attempt_count:j.attempt_count})),
            error:opts.readError?{message:"synthetic DB read error"}:null}),
        };return chain;
      },
      update:(patch:Record<string,unknown>)=>{
        const predicates:((j:Job)=>boolean)[]=[];
        const chain={
          eq:(key:string,val:unknown)=>{predicates.push(j=>j[key as keyof Job]===val);return chain;},
          lte:(key:string,val:string)=>{predicates.push(j=>String(j[key as keyof Job]??"")<=val);return chain;},
          select:()=>({maybeSingle:async()=>{
            if(opts.writeError)return {data:null,error:{message:"synthetic DB write error"}};
            const row=rows.find(j=>predicates.every(f=>f(j)));
            if(!row)return {data:null,error:null};
            Object.assign(row,patch);patches.push(patch);
            return {data:{id:row.id},error:null};
          }}),
          then:(resolve:(val:unknown)=>void)=>{
            if(opts.writeError){resolve({error:{message:"synthetic DB write error"}});return;}
            for(const row of rows.filter(j=>predicates.every(f=>f(j)))){Object.assign(row,patch);patches.push(patch);}
            resolve({error:null});
          },
        };return chain;
      },
    };
  }} as unknown as SupabaseClient;
  return {admin,rows,patches};
}
const run=(admin:SupabaseClient)=>reconcilePendingMarketingEnrollments(admin,"synthetic-key","synthetic-segment");
describe("Gate 3 durable enrollment — mocked provider, concurrency-safe queue",()=>{
  beforeEach(()=>vi.clearAllMocks());
  it("503 results in pending retry with durable backoff",async()=>{
    mock.enroll.mockResolvedValue("retry_required");const q=queue([job()]);
    expect(await run(q.admin)).toEqual({attempted:1,completed:0,blocked:0,deferred:1});
    expect(q.rows[0]).toMatchObject({status:"pending",attempt_count:1,last_error:"provider_retry_required"});
    expect(new Date(q.rows[0]!.next_attempt_at).getTime()).toBeGreaterThan(Date.now());
  });
  it("successful retry completes provider enrollment",async()=>{
    mock.enroll.mockResolvedValue("created");const q=queue([job("one",1)]);
    expect(await run(q.admin)).toMatchObject({completed:1});
    expect(q.rows[0]).toMatchObject({status:"completed",attempt_count:2,claim_token:null,lease_expires_at:null});
  });
  it("withdrawal before retry blocks enrollment",async()=>{
    mock.enroll.mockResolvedValue("blocked");const q=queue([job()]);
    expect(await run(q.admin)).toMatchObject({blocked:1,completed:0});
    expect(q.rows[0]).toMatchObject({status:"blocked",last_error:"eligibility_blocked"});
  });
  it("already enrolled membership completes without duplicate provider creation",async()=>{
    mock.enroll.mockResolvedValue("already_subscribed");const q=queue([job()]);
    expect(await run(q.admin)).toMatchObject({completed:1});
  });
  it("two competing workers can only make one provider request",async()=>{
    mock.enroll.mockResolvedValue("created");const q=queue([job()]);
    const out=await Promise.all([run(q.admin),run(q.admin)]);
    expect(out.reduce((s,x)=>s+x.attempted,0)).toBe(1);
    expect(mock.enroll).toHaveBeenCalledTimes(1);
  });
  it("expired processing lease recovers after simulated worker crash",async()=>{
    mock.enroll.mockResolvedValue("already_subscribed");
    const q=queue([{...job(),status:"processing",claim_token:"old-token",
      lease_expires_at:"2026-11-01T00:00:00Z"}]);
    expect(await run(q.admin)).toMatchObject({completed:1});
  });
  it("lookup error fails before contacting provider",async()=>{
    const q=queue([],{readError:true});
    await expect(run(q.admin)).rejects.toThrow("Cannot load pending");
    expect(mock.enroll).not.toHaveBeenCalled();
  });
  it("write errors are not reported as successful enrollment",async()=>{
    const q=queue([job()],{writeError:true});
    await expect(run(q.admin)).rejects.toThrow("Cannot recover stale");
    expect(mock.enroll).not.toHaveBeenCalled();
  });
  it("batch is limited to twenty jobs",async()=>{
    mock.enroll.mockResolvedValue("blocked");
    const q=queue(Array.from({length:25},(_,i)=>job(String(i))));
    expect((await run(q.admin)).attempted).toBe(20);
    expect(mock.enroll).toHaveBeenCalledTimes(20);
  });
});
