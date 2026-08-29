import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..", "..", "..", "..");
const read = (rel: string) => readFileSync(path.join(REPO_ROOT, rel), "utf8");

describe("SR-10A customer booking query-cost contract", () => {
  it("batches saved-address enrichment instead of querying once per booking", () => {
    const src = read("apps/web/lib/customer/customerBookingsForUser.ts");

    expect(src).toContain("enrichCustomerBookingRowsFromSavedAddresses");
    expect(src).toContain('.from("customer_saved_addresses")');
    expect(src).toContain('.in("user_id", ownerIds)');
    expect(src).toContain('.in("suburb", suburbs)');
    expect(src).not.toContain("enrichCustomerBookingRowFromSavedAddress");
    expect(src).not.toContain("rows[i] = await enrichCustomerBookingRowFromSavedAddress");
  });

  it("does not remove the existing customer-list bound while pagination is handled separately", () => {
    const src = read("apps/web/lib/customer/customerBookingsForUser.ts");

    expect(src).toContain("export const CUSTOMER_BOOKINGS_LIST_LIMIT = 500");
    expect(src).toContain(".limit(CUSTOMER_BOOKINGS_LIST_LIMIT)");
  });
});
