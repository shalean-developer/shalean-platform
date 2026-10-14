import { describe, it, expect } from "vitest";
import { cleanerPaymentReference } from "../cleanerPaymentReference";
describe("permanent cleaner bank reference", () => {
  it("includes the cleaner identity and month within 20 characters", () => {
    expect(cleanerPaymentReference("SHL-CL-000001", "2026-10")).toBe("SHL-CL-000001-202610");
    expect(cleanerPaymentReference("SHL-CL-999999", "2026-12").length).toBe(20);
  });
  it("does not allow another cleaner or month to share a reference", () => {
    expect(cleanerPaymentReference("SHL-CL-000001", "2026-10")).not.toBe(cleanerPaymentReference("SHL-CL-000002", "2026-10"));
    expect(cleanerPaymentReference("SHL-CL-000001", "2026-10")).not.toBe(cleanerPaymentReference("SHL-CL-000001", "2026-11"));
  });
  it.each(["", "SHL-CL-1", "SHL-CL-000001\n", "SHL-CL-1000000"])("rejects malformed IDs %j", id => {
    expect(() => cleanerPaymentReference(id, "2026-10")).toThrow();
  });
  it.each(["2026-00", "2026-13", "26-10", "2026-10-31"])("rejects malformed months %j", month => {
    expect(() => cleanerPaymentReference("SHL-CL-000001", month)).toThrow();
  });
});
