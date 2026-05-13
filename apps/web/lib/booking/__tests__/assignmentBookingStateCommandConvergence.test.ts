import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const bookingDir = path.resolve(__dirname, "..");
const command = path.join(bookingDir, "assignmentBookingStateCommands.ts");

const migratedCallSites = [
  path.join(bookingDir, "assignCleaner.ts"),
  path.join(bookingDir, "reassignBookingAfterDecline.ts"),
  path.join(bookingDir, "runAssignmentAckTimeouts.ts"),
  path.resolve(__dirname, "../../dispatch/assignCleaner.ts"),
  path.resolve(__dirname, "../../dispatch/escalatePendingAck.ts"),
  path.resolve(__dirname, "../../dispatch/redispatchAfterOfferReject.ts"),
  path.resolve(__dirname, "../../dispatch/dispatchRetryQueue.ts"),
  path.resolve(__dirname, "../../dispatch/runDispatchTimeouts.ts"),
  path.resolve(__dirname, "../../dispatch/syncBookingDispatchExpiredWhenNoPendingOffers.ts"),
  path.resolve(__dirname, "../../dispatch/smartAssignCleaner.ts"),
];

const intentionallyUnmigrated = [
  path.resolve(__dirname, "../../dispatch/assignTeamToBooking.ts"),
  path.resolve(__dirname, "../../dispatch/dispatchOffers.ts"),
  path.resolve(__dirname, "../../cleaner/runCleanerBookingLifecycleAction.ts"),
  path.resolve(__dirname, "../paymentFinalizationBookingCommands.ts"),
  path.resolve(__dirname, "../../admin/adminBookingLifecycleStatusOverrideCommand.ts"),
  path.resolve(__dirname, "../../admin/adminManualBookingOfferCommand.ts"),
  path.resolve(__dirname, "../../monthlyInvoice/finalizeDueMonthlyInvoices.ts"),
  path.resolve(__dirname, "../../monthlyInvoice/applyMonthlyInvoicePayment.ts"),
  path.resolve(__dirname, "../../monthlyInvoice/markMonthlyInvoicePaidManual.ts"),
];

describe("assignment booking-state command convergence (Phase 1H)", () => {
  it("owns the pending booking assignCleaner update shape unchanged", () => {
    const src = readFileSync(command, "utf8");

    expect(src).toContain("assignPendingBookingCleaner");
    expect(src).toMatch(
      /\.from\("bookings"\)[\s\S]*?\.update\(params\.patch\)[\s\S]*?\.eq\("id",\s*params\.bookingId\)[\s\S]*?\.eq\("status",\s*"pending"\)[\s\S]*?\.is\("cleaner_id",\s*null\)/,
    );
  });

  it("owns the decline reassignment and ack-timeout release race checks unchanged", () => {
    const src = readFileSync(command, "utf8");

    expect(src).toContain("reassignPendingAssignmentBookingAfterDecline");
    expect(src).toMatch(
      /\.update\(params\.patch\)[\s\S]*?\.eq\("id",\s*params\.bookingId\)[\s\S]*?\.eq\("status",\s*"pending_assignment"\)[\s\S]*?\.is\("cleaner_id",\s*null\)[\s\S]*?\.select\(params\.select\)[\s\S]*?\.maybeSingle\(\)/,
    );
    expect(src).toContain("releaseAssignedBookingAfterAckTimeout");
    expect(src).toMatch(
      /\.update\(params\.patch\)[\s\S]*?\.eq\("id",\s*params\.bookingId\)[\s\S]*?\.eq\("status",\s*"assigned"\)[\s\S]*?\.select\("id"\)[\s\S]*?\.maybeSingle\(\)/,
    );
  });

  it("owns ack escalation pending-response and redispatch CAS guards unchanged", () => {
    const src = readFileSync(command, "utf8");

    expect(src).toContain("failBookingAfterAckEscalationExhausted");
    expect(src).toContain("clearBookingForAckEscalationRedispatch");
    expect(src).toMatch(/\.eq\("cleaner_response_status",\s*params\.cleanerResponseStatus\)/);
    expect(src).toContain("bumpRedispatchAttemptForBooking");
    expect(src).toMatch(
      /\.update\(\{ dispatch_status: "searching", dispatch_attempt_count: params\.nextAttempts \}\)[\s\S]*?\.in\("status",\s*\[\.\.\.params\.eligibleStatuses\]\)[\s\S]*?\.is\("cleaner_id",\s*null\)[\s\S]*?\.eq\("dispatch_attempt_count",\s*params\.expectedAttempts\)[\s\S]*?\.select\("id"\)[\s\S]*?\.maybeSingle\(\)/,
    );
  });

  it("migrates only assignment/reassignment booking-state call sites", () => {
    for (const p of migratedCallSites) {
      const src = readFileSync(p, "utf8");
      expect(src, `${path.basename(p)} should use assignment booking commands`).toContain(
        "assignmentBookingStateCommands",
      );
    }
  });

  it("removes direct bookings.update calls from migrated assignment orchestrators", () => {
    for (const p of migratedCallSites) {
      const src = readFileSync(p, "utf8");
      expect(src, `${path.basename(p)} should not directly update bookings`).not.toMatch(
        /\.from\("bookings"\)[\s\S]{0,180}?\.update\(/,
      );
    }
  });

  it("keeps team assignment, offer acceptance, cleaner lifecycle, payment, admin, and monthly invoice flows out of Phase 1H", () => {
    for (const p of intentionallyUnmigrated) {
      const src = readFileSync(p, "utf8");
      expect(src, `${path.basename(p)} must not use assignment booking commands`).not.toContain(
        "assignmentBookingStateCommands",
      );
    }
  });
});
