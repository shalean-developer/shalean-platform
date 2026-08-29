import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../../..");
const routeSource = readFileSync(path.join(root, "app/api/customer/bookings/route.ts"), "utf8");
const pageLoaderSource = readFileSync(path.join(root, "lib/customer/customerBookingPageForUser.ts"), "utf8");
const hookSource = readFileSync(path.join(root, "hooks/useBookings.ts"), "utf8");
const pageSource = readFileSync(path.join(root, "app/(ui-redesign)/account/bookings/page.tsx"), "utf8");

describe("SR-10C customer booking pagination/query-cost closure", () => {
  it("keeps the canonical customer bookings route on the bounded page loader", () => {
    expect(routeSource).toContain("loadCustomerBookingPageForUser");
    expect(routeSource).not.toContain("loadCustomerBookingRowsForUser");
    expect(routeSource).toContain("pageInfo: out.pageInfo");
  });

  it("keeps page size bounded and cursor-based", () => {
    expect(pageLoaderSource).toContain("CUSTOMER_BOOKINGS_PAGE_DEFAULT_LIMIT = 25");
    expect(pageLoaderSource).toContain("CUSTOMER_BOOKINGS_PAGE_MAX_LIMIT = 50");
    expect(pageLoaderSource).toContain("const fetchLimit = limit + 1");
    expect(pageLoaderSource).toContain('.order("created_at", { ascending: false })');
    expect(pageLoaderSource).toContain('.order("id", { ascending: false })');
    expect(pageLoaderSource).toContain("nextCursor");
  });

  it("keeps saved-address enrichment batched instead of per-booking", () => {
    expect(pageLoaderSource).toContain('.from("customer_saved_addresses")');
    expect(pageLoaderSource).toContain('.in("user_id", ownerIds)');
    expect(pageLoaderSource).toContain('.in("suburb", suburbs)');
    expect(pageLoaderSource).not.toMatch(/for\s*\([^)]*rows[^)]*\)[\s\S]{0,240}from\("customer_saved_addresses"\)/);
  });

  it("keeps the account consumer capable of progressively loading older pages", () => {
    expect(hookSource).toContain("loadOlderBookings");
    expect(hookSource).toContain("nextCursor");
    expect(pageSource).toContain("Load older bookings");
  });
});
