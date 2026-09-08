import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sourcePath = path.resolve(process.cwd(), "lib/customer/customerBookingsForUser.ts");
const source = fs.readFileSync(sourcePath, "utf8");

describe("SR-10 customer booking address batching contract", () => {
  it("batches address lookup by the required owner and suburb keys", () => {
    expect(source).toContain("enrichCustomerBookingRowsFromSavedAddresses");
    expect(source).toContain('.in("user_id", ownerIds)');
    expect(source).toContain('.in("suburb", suburbs)');
    expect(source).toContain("savedAddressLookupKey(ownerId, target.suburb)");
    expect(source).not.toContain("rows[i] = await enrichCustomerBookingRowFromSavedAddress");
  });

  it("paginates through every matching saved-address page", () => {
    expect(source).toContain("const SAVED_ADDRESS_BATCH_PAGE_SIZE = 500");
    expect(source).toContain("for (let from = 0; ; from += SAVED_ADDRESS_BATCH_PAGE_SIZE)");
    expect(source).toContain(".range(from, from + SAVED_ADDRESS_BATCH_PAGE_SIZE - 1)");
    expect(source).toContain("if (page.length < SAVED_ADDRESS_BATCH_PAGE_SIZE) break");
  });

  it("preserves list and booking-detail enrichment without ownership writes", () => {
    expect(source).toContain("await enrichCustomerBookingRowsFromSavedAddresses(admin, rows)");
    expect(source).toContain("await enrichCustomerBookingRowsFromSavedAddresses(admin, detailRows)");
    expect(source).toContain("Math.abs(createdMs - bookingCreatedMs) < 5 * 60 * 1000");
    expect(source).not.toContain(".update({ customer_id:");
  });
});
