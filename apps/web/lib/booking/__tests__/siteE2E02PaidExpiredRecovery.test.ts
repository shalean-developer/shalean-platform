import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const bookingDir = join(process.cwd(), "lib/booking");
const paystack = readFileSync(join(bookingDir, "upsertBookingFromPaystack.ts"), "utf8");
const admin = readFileSync(join(bookingDir, "adminMarkBookingPaid.ts"), "utf8");
const command = readFileSync(join(bookingDir, "paymentFinalizationBookingCommands.ts"), "utf8");

describe("SITE-E2E-02 paid payment_expired recovery", () => {
  it("treats payment_expired as recoverable on verified Paystack success", () => {
    expect(paystack).toContain('st !== "pending_payment" && st !== "payment_expired"');
    expect(command).toContain('["pending_payment", "payment_expired"].includes(observed.status)');
  });

  it("revives payment_expired during admin full settlement", () => {
    expect(admin).toContain('st === "pending_payment" || st === "payment_expired"');
    expect(admin).toContain('patch.status = hasCleanerRef ? "assigned" : "pending"');
    expect(admin).toContain('patch.dispatch_status = hasCleanerRef ? "assigned" : "searching"');
  });
});
