import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CUSTOMER_BOOKINGS_PAGE_DEFAULT_LIMIT,
  CUSTOMER_BOOKINGS_PAGE_MAX_LIMIT,
  decodeCustomerBookingsCursor,
  encodeCustomerBookingsCursor,
  normalizeCustomerBookingsPageLimit,
} from "@/lib/customer/customerBookingPageForUser";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..", "..", "..", "..");
const read = (rel: string) => readFileSync(path.join(REPO_ROOT, rel), "utf8");

describe("SR-10B customer booking pagination", () => {
  it("bounds customer page sizes", () => {
    expect(CUSTOMER_BOOKINGS_PAGE_DEFAULT_LIMIT).toBe(25);
    expect(CUSTOMER_BOOKINGS_PAGE_MAX_LIMIT).toBe(50);
    expect(normalizeCustomerBookingsPageLimit(undefined)).toBe(25);
    expect(normalizeCustomerBookingsPageLimit(0)).toBe(1);
    expect(normalizeCustomerBookingsPageLimit(999)).toBe(50);
  });

  it("round-trips the stable created_at + id cursor", () => {
    const cursor = encodeCustomerBookingsCursor({
      id: "00000000-0000-4000-8000-000000000123",
      created_at: "2026-08-29T08:00:00.000Z",
    });
    expect(decodeCustomerBookingsCursor(cursor)).toEqual({
      id: "00000000-0000-4000-8000-000000000123",
      createdAt: "2026-08-29T08:00:00.000Z",
    });
    expect(decodeCustomerBookingsCursor("not-a-valid-cursor")).toBeNull();
  });

  it("uses a bounded cursor query and keeps pending-payment rows visible", () => {
    const loader = read("apps/web/lib/customer/customerBookingPageForUser.ts");
    expect(loader).toContain("const fetchLimit = limit + 1");
    expect(loader).toContain('.order("created_at", { ascending: false })');
    expect(loader).toContain('.order("id", { ascending: false })');
    expect(loader).toContain('.neq("status", "payment_expired")');
    expect(loader).not.toContain('.neq("status", "pending_payment")');
  });

  it("publishes pageInfo from the API and consumes it in the account hook", () => {
    const route = read("apps/web/app/api/customer/bookings/route.ts");
    const hook = read("apps/web/hooks/useBookings.ts");
    const page = read("apps/web/app/(ui-redesign)/account/bookings/page.tsx");

    expect(route).toContain("pageInfo: out.pageInfo");
    expect(hook).toContain("cursor=${encodeURIComponent(nextCursor)}");
    expect(hook).toContain("mergeBookingRows(current, incoming)");
    expect(page).toContain("Load older bookings");
    expect(page).toContain("void loadMore()");
  });

  it("keeps every existing web consumer complete through bounded cursor pages", () => {
    const hook = read("apps/web/hooks/useBookings.ts");
    expect(hook).toContain("async function fetchAllBookingRows()");
    expect(hook).toContain("limit: String(CUSTOMER_BOOKINGS_PAGE_LIMIT)");
    expect(hook).toContain('query.set("cursor", cursor)');
    expect(hook).toContain("seenCursors.has(nextCursor)");
    expect(hook).toContain("setRows(out.rows)");
  });

  it("keeps customer-mobile history complete through the same bounded cursor contract", () => {
    const hook = read("apps/customer-mobile/hooks/useCustomerBookings.ts");
    const types = read("apps/customer-mobile/services/types/customerBookings.ts");
    const api = read("packages/api-client/src/domains/customerBookings.ts");
    expect(hook).toContain("{ cursor, limit: 25 }");
    expect(hook).toContain("seenCursors.has(nextCursor)");
    expect(types).toContain("pageInfo?:");
    expect(api).toContain('query.set("cursor", params.cursor)');
  });

  it("loads all pages before replacement so upcoming and realtime history cannot truncate", () => {
    const hook = read("apps/web/hooks/useBookings.ts");
    expect(hook).toContain("const out = await fetchAllBookingRows()");
    expect(hook).toContain("setRows(out.rows)");
    expect(hook.indexOf("setRows(out.rows)")).toBeGreaterThan(hook.indexOf("const out = await fetchAllBookingRows()"));
    expect(hook).toContain("fetchBookings({ silent: true })");
  });

  it("preserves read-only ownership enforcement without ownership writes", () => {
    const route = read("apps/web/app/api/customer/bookings/route.ts");
    const hook = read("apps/web/hooks/useBookings.ts");
    const loader = read("apps/web/lib/customer/customerBookingPageForUser.ts");
    expect(loader).toContain("customerCanAccessBookingRow(row, userId, viewerNorm)");
    expect(loader).toContain(".is(args.ownershipColumn, null)");
    expect(route).not.toContain("claimCustomerBookingOwnership");
    expect(route).not.toContain("export async function POST");
    expect(hook).not.toContain("claimCustomerBookingOwnershipForAccount");
  });
});
