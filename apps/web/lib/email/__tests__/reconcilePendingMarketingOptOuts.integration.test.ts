import { beforeEach,describe,expect,it,vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
const mock=vi.hoisted(()=>({unsubscribe:vi.fn()}));
vi.mock("@/lib/email/reconcileResendUnsubscribe",()=>({reconcileResendUnsubscribe:mock.unsubscribe}));
import { reconcilePendingMarketingOptOuts } from "../reconcilePendingMarketingOptOuts";

type Job={id:string;email:string;attempt_count:number;status:string;next_attempt_at:string;
  claim_token?:string|null;lease_expires_at?:string|null;last_error?:string|null};
const email="synthetic@example.test";
const pending=(id="job-1",attempts=0):Job=>({
  id,email,attempt_count:attempts,status:"pending",next_attempt_at:"2026-11-01T00:00:00Z",
  claim_token:null,lease_expires_at:null,
});
function makeQueue(jobs:Job[],opts:{readError?:boolean;writeError?:boolean}={}){
  const written:Record<string,unknown>[]=[];
  const rows=jobs.map(j=>({...j}));
  const admin={from(table:string){
    if(table!=="marketing_email_reconciliation_jobs")throw Error("unexpected table");
    return {
      select:()=>{
        const where:(()=>boolean)[]=[];
        // Query chain stores closures referencing each row via predicates instead.
        const filters:((j:Job)=>boolean)[]=[];
        const chain={
          eq:(key:string,value:unknown)=>{filters.push(j=>j[key as keyof Job]===value);return chain;},
          lte:(key:string,value:string)=>{filters.push(j=>String(j[key as keyof Job]??"")<=value);return chain;},
          order:()=>chain,
          limit:async(n:number)=>({data:rows.filter(j=>filters.every(fn=>fn(j))).slice(0,n)
            .map(j=>({id:j.id,email:j.email,attempt_count:j.attempt_count})),
            error:opts.readError?{message:"synthetic DB read failure"}:null}),
        };
        void where;
        return chain;
      },
      update:(patch:Record<string,unknown>)=>{
        const filters:((j:Job)=>boolean)[]=[];
        const chain={
          eq:(key:string,value:unknown)=>{filters.push(j=>j[key as keyof Job]===value);return chain;},
          lte:(key:string,value:string)=>{filters.push(j=>String(j[key as keyof Job]??"")<=value);return chain;},
          select:()=>({maybeSingle:async()=>{
            if(opts.writeError)return {data:null,error:{message:"synthetic DB write failure"}};
            const row=rows.find(j=>filters.every(fn=>fn(j)));
            if(!row)return {data:null,error:null};
            Object.assign(row,patch);written.push(patch);
            return {data:{id:row.id},error:null};
          }}),
          then:(resolve:(value:unknown)=>void)=>{
            if(opts.writeError){resolve({error:{message:"synthetic DB write failure"}});return;}
            for(const row of rows.filter(j=>filters.every(fn=>fn(j)))){
              Object.assign(row,patch);written.push(patch);
            }
            resolve({error:null});
          },
        };
        return chain;
      },
    };
  }} as unknown as SupabaseClient;
  return {admin,rows,written};
}
const run=(db:SupabaseClient)=>reconcilePendingMarketingOptOuts(db,"synthetic-api-key");
describe("Gate 3 atomic unsubscribe queue synthetic reconciliation — no provider network",()=>{
  beforeEach(()=>vi.clearAllMocks());
  it("success claims then completes the same job",async()=>{
    mock.unsubscribe.mockResolvedValue("updated");const q=makeQueue([pending()]);
    expect(await run(q.admin)).toEqual({attempted:1,completed:1,deferred:0});
    expect(q.rows[0]).toMatchObject({status:"completed",attempt_count:1,claim_token:null,lease_expires_at:null});
    expect(q.written.some(x=>x.status==="processing"&&typeof x.claim_token==="string")).toBe(true);
  });
  it("429 and 503 keep a pending job with backoff",async()=>{
    mock.unsubscribe.mockResolvedValue("retry_required");const q=makeQueue([pending()]);
    expect(await run(q.admin)).toMatchObject({deferred:1});
    expect(q.rows[0]).toMatchObject({status:"pending",attempt_count:1,last_error:"provider_retry_required"});
    expect(new Date(q.rows[0]!.next_attempt_at).getTime()).toBeGreaterThan(Date.now());
  });
  it("provider contact 404 is idempotently completed",async()=>{
    mock.unsubscribe.mockResolvedValue("not_found");const q=makeQueue([pending()]);
    expect(await run(q.admin)).toMatchObject({completed:1});
  });
  it("expired processing lease is reclaimed and safely replayed",async()=>{
    mock.unsubscribe.mockResolvedValue("updated");
    const job={...pending(),status:"processing",claim_token:"stale",lease_expires_at:"2026-11-01T00:00:00Z"};
    const q=makeQueue([job]);expect(await run(q.admin)).toMatchObject({completed:1});
    expect(q.rows[0]).toMatchObject({status:"completed",claim_token:null,lease_expires_at:null});
  });
  it("two workers processing the same queue perform only one provider operation",async()=>{
    mock.unsubscribe.mockResolvedValue("updated");const q=makeQueue([pending()]);
    const results=await Promise.all([run(q.admin),run(q.admin)]);
    expect(results.reduce((sum,r)=>sum+r.attempted,0)).toBe(1);
    expect(mock.unsubscribe).toHaveBeenCalledTimes(1);
  });
  it("queue read error never calls provider",async()=>{
    const q=makeQueue([],{readError:true});
    await expect(run(q.admin)).rejects.toThrow("Cannot load");
    expect(mock.unsubscribe).not.toHaveBeenCalled();
  });
  it("failed atomic write is not acknowledged as success",async()=>{
    const q=makeQueue([pending()],{writeError:true});
    await expect(run(q.admin)).rejects.toThrow("Cannot recover stale");
    expect(mock.unsubscribe).not.toHaveBeenCalled();
  });
  it("jobs are limited to twenty per batch",async()=>{
    mock.unsubscribe.mockResolvedValue("updated");
    const q=makeQueue(Array.from({length:25},(_,i)=>pending(String(i))));
    const result=await run(q.admin);
    expect(result.attempted).toBe(20);expect(mock.unsubscribe).toHaveBeenCalledTimes(20);
  });
});
