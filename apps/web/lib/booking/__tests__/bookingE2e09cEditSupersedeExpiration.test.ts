import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

describe("BOOKING-E2E-09C edit supersede expiration convergence", () => {
  it("routes the new edit supersede transition through the canonical terminal boundary", () => {
    const src = read("lib/booking/abandonPendingPaymentForEdit.ts");
    expect(src).toContain("expirePendingPaymentTerminal(admin");
    expect(src).toContain("reason: PAYMENT_EDIT_SUPERSEDED_REASON");
    expect(src).toContain("payment_link_expires_at: null");
    expect(src).toContain("booking_snapshot: snapshot");
    expect(src).not.toContain('.update({\n      status: "payment_expired"');
  });

  it("does not release Cleaning Credit twice on the newly transitioned path", () => {
    const src = read("lib/booking/abandonPendingPaymentForEdit.ts");
    expect(src).toContain("creditAlreadyReleased: true");
    expect(src).toContain("if (!options?.creditAlreadyReleased)");
  });

  it("retains retry cleanup for legacy/incomplete supersede markers", () => {
    const src = read("lib/booking/abandonPendingPaymentForEdit.ts");
    expect(src).toContain("if (row.status === \"payment_expired\" && existingMarker)");
    expect(src).toContain("if (!existingMarker.cleanup_done_at)");
    expect(src).toContain("cleanupSupersededCheckout(admin, row)");
  });
});
