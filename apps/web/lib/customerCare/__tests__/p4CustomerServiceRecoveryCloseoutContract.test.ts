import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const webRoot = path.resolve(process.cwd());
const read = (relative: string) => fs.readFileSync(path.join(webRoot, relative), "utf8");

describe("P4 customer service recovery closeout", () => {
  it("uses the actual customer-care case schema in My Work", () => {
    const source = read("lib/customer-care/customerCareWorkItems.ts");
    expect(source).toContain("customer_email,customer_phone");
    expect(source).toContain("created_at");
    expect(source).not.toContain("customer_name,booking_id,opened_at");
    expect(source).toContain("/office/customer-care?case=");
  });

  it("surfaces customer cases and resolves them through canonical CRM", () => {
    const api = read("app/api/customer/cases/route.ts");
    const page = read("app/(ui-redesign)/account/cases/page.tsx");
    const shell = read("src/features/account/AccountShell.tsx");
    expect(api).toContain('.from("customers")');
    expect(api).toContain('.eq("crm_customer_id", crm.id)');
    expect(page).toContain('/api/customer/cases');
    expect(shell).toContain('/account/cases');
  });

  it("converges old-slot dispatch state after reschedule", () => {
    const route = read("app/api/customer/bookings/[id]/reschedule/route.ts");
    const orchestrator = read("lib/customer/orchestrateCustomerBookingReschedule.ts");
    expect(route).toContain("orchestrateCustomerBookingReschedule");
    expect(orchestrator).toContain("expirePendingDispatchOffersForBooking");
    expect(orchestrator).toContain('from("dispatch_retry_queue")');
    expect(orchestrator).toContain("ensureBookingAssignment");
  });

  it("routes paid cancellations to refund review without moving money", () => {
    const orchestrator = read("lib/customer/orchestrateCustomerBookingCancellation.ts");
    expect(orchestrator).toContain("Cancellation payment review");
    expect(orchestrator).toContain('category: "refund"');
    expect(orchestrator).not.toContain("refundBookingPayment");
    expect(orchestrator).not.toContain("refundPaystackTransaction");
  });

  it("preserves immutable paid cleaner payout history on cancellation", () => {
    const migration = read("../../supabase/migrations/20260809091000_preserve_paid_payout_on_customer_cancellation.sql");
    expect(migration).toContain("old.payout_status");
    expect(migration).toContain("new.cleaner_payout_cents := old.cleaner_payout_cents");
    expect(migration).toContain("new.payout_paid_at := old.payout_paid_at");
  });
});
