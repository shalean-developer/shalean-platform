import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
const provider=vi.hoisted(()=>({ unsubscribe:vi.fn() }));
vi.mock("@/lib/email/reconcileResendUnsubscribe",()=>({
  reconcileResendUnsubscribe:provider.unsubscribe,
}));
import { reconcilePendingMarketingOptOuts } from "../reconcilePendingMarketingOptOuts";

const email="synthetic@example.test";
type Job={id:string;email:string;attempt_count:number};
function queue(due:Job[],opts:{loadError?:boolean;writeError?:boolean}={}){
  const written:Record<string,unknown>[]=[];
  const sb={from(table:string) {
    if(table!=="marketing_email_reconciliation_jobs")throw Error("unexpected table");
    return {
      select:()=>({eq:()=>({lte:()=>({order:()=>({
        limit:async(n:number)=>({data:due.slice(0,n),error:opts.loadError?{message:"synthetic lookup error"}:null}),
      })})})}),
      update:(row:Record<string,unknown>)=>({
        eq:()=>({eq:async()=>{
          written.push(row);
          return {error:opts.writeError?{message:"synthetic write error"}:null};
        }}),
      }),
    };
  }} as unknown as SupabaseClient;
  return {sb,written};
}
describe("Gate 3 unsubscribe queue synthetic provider failure recovery",()=>{
  beforeEach(()=>{vi.clearAllMocks();});
  it("successful unsubscribe marks queue completed",async()=>{
    provider.unsubscribe.mockResolvedValue("updated");
    const {sb,written}=queue([{id:"job-1",email,attempt_count:0}]);
    expect(await reconcilePendingMarketingOptOuts(sb,"synthetic-api-key")).toEqual({
      attempted:1,completed:1,deferred:0,
    });
    expect(written[0]).toMatchObject({status:"completed",attempt_count:1});
  });
  it("429 rate limit preserves pending state with delayed retry",async()=>{
    provider.unsubscribe.mockResolvedValue("retry_required");
    const {sb,written}=queue([{id:"job-1",email,attempt_count:0}]);
    expect(await reconcilePendingMarketingOptOuts(sb,"synthetic-api-key")).toMatchObject({deferred:1});
    expect(written[0]?.status).toBeUndefined();
    expect(written[0]).toMatchObject({attempt_count:1,last_error:"provider_retry_required"});
    expect(new Date(String(written[0]?.next_attempt_at)).getTime()).toBeGreaterThan(Date.now());
  });
  it("provider outage does not drop jobs or mark completed",async()=>{
    provider.unsubscribe.mockResolvedValue("retry_required");
    const {sb,written}=queue([{id:"job-1",email,attempt_count:4}]);
    await reconcilePendingMarketingOptOuts(sb,"synthetic-api-key");
    expect(written[0]?.status).not.toBe("completed");
    expect(written[0]?.attempt_count).toBe(5);
  });
  it("missing provider contact 404 counts as reconciled, never creates it",async()=>{
    provider.unsubscribe.mockResolvedValue("not_found");
    const {sb,written}=queue([{id:"job-1",email,attempt_count:0}]);
    expect(await reconcilePendingMarketingOptOuts(sb,"synthetic-api-key")).toMatchObject({completed:1});
    expect(written[0]?.status).toBe("completed");
  });
  it("query error fails before provider invocation",async()=>{
    const {sb}=queue([],{loadError:true});
    await expect(reconcilePendingMarketingOptOuts(sb,"synthetic-api-key")).rejects.toThrow("Cannot load");
    expect(provider.unsubscribe).not.toHaveBeenCalled();
  });
  it("write error is not acknowledged as success",async()=>{
    provider.unsubscribe.mockResolvedValue("updated");
    const {sb}=queue([{id:"job-1",email,attempt_count:0}],{writeError:true});
    await expect(reconcilePendingMarketingOptOuts(sb,"synthetic-api-key")).rejects.toThrow("Could not persist");
  });
  it("provider requests are bounded to twenty jobs per batch",async()=>{
    provider.unsubscribe.mockResolvedValue("updated");
    const {sb}=queue(Array.from({length:25},(_,i)=>({id:String(i),email,attempt_count:0})));
    const out=await reconcilePendingMarketingOptOuts(sb,"synthetic-api-key");
    expect(out.attempted).toBe(20);
    expect(provider.unsubscribe).toHaveBeenCalledTimes(20);
  });
});
