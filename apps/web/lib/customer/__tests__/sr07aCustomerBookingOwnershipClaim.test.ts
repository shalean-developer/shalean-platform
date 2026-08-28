import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(process.cwd(), "../..");
const read = (p: string) => fs.readFileSync(path.join(repoRoot, p), "utf8");

const claim = read("apps/web/lib/customer/claimCustomerBookingOwnership.ts");
const route = read("apps/web/app/api/customer/bookings/route.ts");
const ownership = read("packages/types/src/customerBookingOwnership.ts");

describe("SR-07A canonical customer booking ownership repair", () => {
  it("claims only email-matched rows whose ownership is still null", () => {
    expect(claim).toContain('.eq("customer_email", email)');
    expect(claim).toContain('.is(ownershipColumn, null)');
    expect(claim).toContain('.update({ [ownershipColumn]: uid })');
  });

  it("keeps conflicting ownership fail-closed", () => {
    expect(ownership).toContain('if (rowUid !== "") return false;');
  });

  it("exposes ownership repair as an explicit authenticated POST, not a GET side effect", () => {
    expect(route).toContain("export async function POST(request: Request)");
    expect(route).toContain("claimCustomerBookingOwnership");
    const getStart = route.indexOf("export async function GET");
    const postStart = route.indexOf("export async function POST");
    const getBody = route.slice(getStart, postStart);
    expect(getBody).not.toContain("claimCustomerBookingOwnership(");
  });
});
