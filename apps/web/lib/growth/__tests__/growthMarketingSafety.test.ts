import { beforeEach, expect, it, vi } from "vitest";
const m=vi.hoisted(()=>({send:vi.fn(),log:vi.fn(),report:vi.fn()}));
vi.mock("server-only",()=>({}));
vi.mock("@/lib/email/safeResendSend",()=>({safeResendSend:m.send}));
vi.mock("@/lib/email/sendBookingEmail",()=>({getDefaultFromAddress:()=>"notices@shalean.co.za"}));
vi.mock("@/lib/logging/systemLog",()=>({logSystemEvent:m.log,reportOperationalIssue:m.report}));
vi.mock("@/lib/customer/customerRebookLinkToken",()=>({customerRebookLandingUrl:()=>"https://shalean.co.za/book"}));
import {sendGrowthRetentionReminderEmail,sendGrowthWinBackEmail} from "../growthEmails";
beforeEach(()=>{vi.clearAllMocks();m.send.mockResolvedValue({data:null,error:{name:"marketing_eligibility",message:"unsubscribed"}})});
it.each([[sendGrowthRetentionReminderEmail,"growth_retention_reminder"],[sendGrowthWinBackEmail,"growth_win_back"]] as const)("routes growth email through current consent checks",async(send,messageType)=>{
  expect(await send({to:"synthetic@example.test",userId:"synthetic-customer"})).toBe(false);
  expect(m.send).toHaveBeenCalledWith(expect.objectContaining({to:"synthetic@example.test",context:{customerId:"synthetic-customer",messageType}}));
  expect(m.log).not.toHaveBeenCalled();
});
it("accepted growth email stays successful when recovery logging is separate",async()=>{
  m.send.mockResolvedValue({data:{id:"synthetic"},error:null});
  expect(await sendGrowthWinBackEmail({to:"synthetic@example.test",userId:"synthetic-customer"})).toBe(true);
});
