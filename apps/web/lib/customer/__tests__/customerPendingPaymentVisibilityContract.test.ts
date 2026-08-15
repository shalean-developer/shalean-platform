import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..", "..", "..", "..");
const read = (rel: string) => readFileSync(path.join(REPO_ROOT, rel), "utf8");

describe("customer pending-payment booking visibility", () => {
  it("keeps pending-payment bookings visible in the customer booking list", () => {
    const src = read("apps/web/lib/customer/customerBookingsForUser.ts");

    expect(src).not.toContain('.neq("status", "pending_payment")');
    expect(src).toContain('.neq("status", "payment_expired")');
  });

  it("allows the customer to open pending-payment booking details", () => {
    const src = read("apps/web/lib/customer/customerBookingsForUser.ts");

    expect(src).not.toContain('st === "pending_payment" || st === "payment_expired"');
    expect(src).toContain('if (st === "payment_expired")');
  });

  it("renders pending-payment bookings as awaiting payment instead of confirmed", () => {
    const card = read("apps/web/components/dashboard/booking-card.tsx");

    expect(card).toContain('rawStatus === "pending_payment"');
    expect(card).toContain('label: "Awaiting payment"');
  });
});
