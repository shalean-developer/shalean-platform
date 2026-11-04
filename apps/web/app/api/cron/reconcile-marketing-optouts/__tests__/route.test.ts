import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(()=>({
  admin:vi.fn(), acquire:vi.fn(), release:vi.fn(), process:vi.fn(), enroll:vi.fn(),
}));
vi.mock("@/lib/supabase/admin",()=>({getSupabaseAdmin:mock.admin}));
vi.mock("@/lib/cron/cronLock",()=>({acquireCronLock:mock.acquire,releaseCronLock:mock.release}));
vi.mock("@/lib/email/reconcilePendingMarketingOptOuts",()=>({reconcilePendingMarketingOptOuts:mock.process}));
vi.mock("@/lib/email/reconcilePendingMarketingEnrollments",()=>({reconcilePendingMarketingEnrollments:mock.enroll}));
import { POST } from "../route";
const request=(authorised=true)=>new Request("https://shalean.co.za/api/cron/reconcile-marketing-optouts",{
  method:"POST",headers:authorised?{Authorization:"Bearer synthetic-cron-secret"}:{},
});
describe("Gate 3 unscheduled unsubscribe worker safety",()=>{
  beforeEach(()=>{
    vi.clearAllMocks();
    vi.stubEnv("CRON_SECRET","synthetic-cron-secret");
    vi.stubEnv("RESEND_API_KEY","synthetic-resend-key");
    vi.stubEnv("RESEND_AUDIENCE_SEGMENT_ID","");
    mock.admin.mockReturnValue({name:"synthetic-db"});
    mock.acquire.mockResolvedValue({ok:true,jobName:"cron:reconcile-marketing-optouts",holderId:"synthetic-lock-id"});
    mock.process.mockResolvedValue({attempted:1,completed:1,deferred:0});
    mock.enroll.mockResolvedValue({attempted:1,completed:0,blocked:1,deferred:0});
    mock.release.mockResolvedValue(undefined);
  });
  afterEach(()=>vi.unstubAllEnvs());
  it("rejects unauthorised invocation before provider access",async()=>{
    const response=await POST(request(false));
    expect(response.status).toBe(401);
    expect(mock.acquire).not.toHaveBeenCalled();
    expect(mock.process).not.toHaveBeenCalled();
  });
  it("concurrent lock holder prevents duplicate replay",async()=>{
    mock.acquire.mockResolvedValue({ok:false,reason:"concurrent_run"});
    const response=await POST(request());
    expect(await response.json()).toMatchObject({skipped:"concurrent_run"});
    expect(mock.process).not.toHaveBeenCalled();
    expect(mock.release).not.toHaveBeenCalled();
  });
  it("lock infrastructure outage fails closed (no provider write)",async()=>{
    mock.acquire.mockResolvedValue({ok:true,degraded:true,error:"synthetic db unavailable"});
    const response=await POST(request());
    expect(response.status).toBe(503);
    expect(mock.process).not.toHaveBeenCalled();
  });
  it("normal synthetic worker runs only within lock and releases lease",async()=>{
    const response=await POST(request());
    expect(await response.json()).toMatchObject({ok:true,attempted:1,completed:1,deferred:0});
    expect(mock.process).toHaveBeenCalledTimes(1);
    expect(mock.release).toHaveBeenCalledWith({name:"synthetic-db"},"cron:reconcile-marketing-optouts","synthetic-lock-id");
  });
  it("worker failure releases lock without leaking credentials",async()=>{
    mock.process.mockRejectedValue(new Error("synthetic 503"));
    const response=await POST(request());
    expect(response.status).toBe(500);
    expect(mock.release).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(await response.json())).not.toContain("synthetic 503");
  });
  it("explicit segment activates synthetic enrollment only after opt-out processing",async()=>{
    vi.stubEnv("RESEND_AUDIENCE_SEGMENT_ID","synthetic-segment");
    const res=await POST(request());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      enrollment:{attempted:1,completed:0,blocked:1,deferred:0},
    });
    expect(mock.process).toHaveBeenCalledTimes(1);
    expect(mock.enroll).toHaveBeenCalledWith({name:"synthetic-db"},"synthetic-resend-key","synthetic-segment");
    expect(mock.process.mock.invocationCallOrder[0]).toBeLessThan(mock.enroll.mock.invocationCallOrder[0]);
  });
  it("no segment configuration leaves enrollment worker disabled",async()=>{
    const res=await POST(request());
    expect(res.status).toBe(200);
    expect(mock.enroll).not.toHaveBeenCalled();
  });

});
