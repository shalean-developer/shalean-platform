import { describe, expect, it } from "vitest";
import {
  isDispatchOfferAcceptReply,
  isDispatchOfferDeclineReply,
  isAssignedBookingAcceptReply,
} from "@/lib/booking/cleanerReplyIntent";

describe("dispatch offer reply (1/2 + fallbacks)", () => {
  it("accepts 1 and fallbacks", () => {
    expect(isDispatchOfferAcceptReply("1")).toBe(true);
    expect(isDispatchOfferAcceptReply("yes")).toBe(true);
    expect(isDispatchOfferAcceptReply("ok i accept")).toBe(true);
  });
  it("declines 2 and fallbacks", () => {
    expect(isDispatchOfferDeclineReply("2")).toBe(true);
    expect(isDispatchOfferDeclineReply("no")).toBe(true);
  });
  it("isAssigned still treats 1 as accept for assigned-booking path", () => {
    expect(isAssignedBookingAcceptReply("1")).toBe(true);
  });
});
