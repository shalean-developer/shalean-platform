import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sourcePath = path.resolve(process.cwd(), "lib/customer/customerBookingsForUser.ts");
const source = fs.readFileSync(sourcePath, "utf8");

describe("SR-10 customer booking address enrichment contract", () => {
  it("batches saved-address lookup instead of querying once per booking", () => {
    expect(source).toContain("enrichCustomerBookingRowsFromSavedAddresses");
    expect(source).toContain('.in("user_id", ownerIds)');
    expect(source).toContain('.in("suburb", suburbs)');
    expect(source).toContain("await enrichCustomerBookingRowsFromSavedAddresses(admin, rows)");
    expect(source).not.toContain("rows[i] = await enrichCustomerBookingRowFromSavedAddress");
  });
});
