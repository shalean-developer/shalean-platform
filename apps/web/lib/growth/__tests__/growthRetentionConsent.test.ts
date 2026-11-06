import {beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({gate:vi.fn(),email:vi.fn(),sms:vi.fn(),touch:vi.fn()}));
vi.mock("server-only",()=>({}));
vi.mock("@/lib/email/marketingSendGate",()=>({checkMarketingSendGate:m.gate}));
vi.mock("@/lib/growth/growthEmails",()=>({sendGrowthRetentionReminderEmail:m.email,sendGrowthWinBackEmail:m.email,sendGrowthTouchSms:m.sms}));
vi.mock("@/lib/growth/decideGrowthActionWithAi",()=>({decideGrowthActionWithAi:async()=>({action:"retention_reminder",channel:"email"})}));
vi.mock("@/lib/growth/customerLTV",()=>({calculateCustomerLTV:()=>({ltv_score:1})}));
vi.mock("@/lib/growth/customerRetention",()=>({evaluateCustomerRetentionState:()=>"at_risk"}));
vi.mock("@/lib/growth/customerSegment",()=>({segmentCustomer:()=>"repeat"}));
vi.mock("@/lib/growth/growthActionOutcomes",()=>({recordGrowthActionOutcomeSent:m.touch}));
vi.mock("@/lib/growth/growthTouchCooldown",()=>({discountBudgetOk:async()=>true,hasGrowthCooldown:async()=>false,insertGrowthTouch:m.touch}));
vi.mock("@/lib/growth/loadCustomerGrowthContext",()=>({loadCustomerGrowthContext:async()=>({email:"synthetic@example.test",phone:"+27000000000",bookingCount:2,totalSpentCents:100}),persistCustomerSegmentRow:vi.fn()}));
vi.mock("@/lib/ai-autonomy/optimizeTiming",()=>({applySendDelayIfNeeded:vi.fn()}));
vi.mock("@/lib/logging/systemLog",()=>({logSystemEvent:vi.fn()}));
import {runCustomerRetentionCronBatch} from "../runCustomerRetentionCron";
const admin:any={from:()=>({select:()=>({gt:()=>({order:()=>({limit:async()=>({data:[{id:"synthetic-customer"}],error:null})})})})})};
beforeEach(()=>{vi.clearAllMocks();m.email.mockResolvedValue(false);m.gate.mockResolvedValue({allowed:false,reason:"unsubscribed"})});
it("does not turn marketing denial into SMS fallback or a sent touch",async()=>{
 const result=await runCustomerRetentionCronBatch(admin);
 expect(result.skippedChannel).toBe(1);expect(m.email).not.toHaveBeenCalled();expect(m.sms).not.toHaveBeenCalled();expect(m.touch).not.toHaveBeenCalled();
});
it("ambiguous or blocked email submission cannot trigger duplicate SMS",async()=>{
 m.gate.mockResolvedValue({allowed:true});
 const result=await runCustomerRetentionCronBatch(admin);
 expect(m.email).toHaveBeenCalledOnce();expect(result.emailsSent).toBe(0);expect(m.sms).not.toHaveBeenCalled();expect(m.touch).not.toHaveBeenCalled();
});
