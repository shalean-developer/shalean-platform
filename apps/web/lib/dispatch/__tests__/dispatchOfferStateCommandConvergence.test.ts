import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const dispatchDir = path.resolve(__dirname, "..");
const dispatchOffers = path.join(dispatchDir, "dispatchOffers.ts");

const migratedAcceptCallSites = [
  path.resolve(__dirname, "../../../app/api/offers/accept/route.ts"),
  path.resolve(__dirname, "../../../app/api/cleaner/offers/[id]/accept/route.ts"),
  path.resolve(__dirname, "../../../app/api/cleaner/offers/[id]/respond/route.ts"),
  path.resolve(__dirname, "../../../app/api/webhooks/whatsapp/route.ts"),
];

const intentionallyUnmigrated = [
  path.resolve(__dirname, "../../admin/performAdminAssignToCleaner.ts"),
  path.resolve(__dirname, "../../../app/api/admin/bookings/[id]/route.ts"),
  path.resolve(__dirname, "../../cleaner/runCleanerBookingLifecycleAction.ts"),
  path.resolve(__dirname, "../../monthlyInvoice/finalizeDueMonthlyInvoices.ts"),
  path.resolve(__dirname, "../../monthlyInvoice/applyMonthlyInvoicePayment.ts"),
  path.resolve(__dirname, "../../monthlyInvoice/markMonthlyInvoicePaidManual.ts"),
];

function functionBody(src: string, name: string): string {
  const start = src.search(new RegExp(`export\\s+async\\s+function\\s+${name}\\s*\\(`));
  if (start < 0) throw new Error(`${name} not found`);
  const bodyStart = src.indexOf("{", src.indexOf(")", start));
  let depth = 0;
  for (let i = bodyStart; i < src.length; i += 1) {
    const ch = src[i];
    if (ch === "{") depth += 1;
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) return src.slice(bodyStart, i + 1);
    }
  }
  throw new Error(`${name} body not closed`);
}

describe("dispatch offer state command convergence (Phase 1C)", () => {
  it("sets booking dispatch offered through a named command boundary", () => {
    const src = readFileSync(dispatchOffers, "utf8");
    const commandBody = functionBody(src, "setBookingDispatchOffered");
    const createBody = functionBody(src, "createDispatchOfferRow");

    expect(commandBody).toMatch(/\.from\("bookings"\)[\s\S]*?\.update\(\{\s*dispatch_status:\s*"offered"\s*\}\)/);
    expect(commandBody).toMatch(/\.eq\("id",\s*params\.bookingId\)/);
    expect(createBody).toContain("setBookingDispatchOffered");
    expect(createBody).not.toMatch(/\.from\("bookings"\)[\s\S]*?\.update\(\{\s*dispatch_status:\s*"offered"\s*\}\)/);
  });

  it("acceptBookingDispatchOffer delegates to the existing accept flow unchanged", () => {
    const src = readFileSync(dispatchOffers, "utf8");
    const wrapperBody = functionBody(src, "acceptBookingDispatchOffer");
    const acceptBody = functionBody(src, "acceptDispatchOffer");

    expect(wrapperBody).toMatch(/return\s+acceptDispatchOffer\(params\)/);
    expect(wrapperBody).not.toContain("accept_dispatch_offer_atomic");
    expect(acceptBody).toContain("accept_dispatch_offer_atomic");
  });

  it("migrates only the safest offer-accept entrypoints to the named command", () => {
    for (const p of migratedAcceptCallSites) {
      const src = readFileSync(p, "utf8");
      expect(src, `${path.basename(path.dirname(p))}/${path.basename(p)} must use command wrapper`).toContain(
        "acceptBookingDispatchOffer",
      );
      expect(src, `${path.basename(path.dirname(p))}/${path.basename(p)} must not call acceptDispatchOffer directly`).not.toMatch(
        /\bacceptDispatchOffer\(/,
      );
    }
  });

  it("leaves admin patch, cleaner lifecycle, and monthly invoice flows out of Phase 1C", () => {
    for (const p of intentionallyUnmigrated) {
      const src = readFileSync(p, "utf8");
      expect(src, `${path.basename(p)} must not use dispatch offer state commands yet`).not.toContain(
        "acceptBookingDispatchOffer",
      );
      expect(src, `${path.basename(p)} must not use dispatch offered command yet`).not.toContain(
        "setBookingDispatchOffered",
      );
    }
  });
});
