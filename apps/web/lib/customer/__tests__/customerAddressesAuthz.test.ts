import { describe, expect, it } from "vitest";
import {
  customerOwnsAddressRow,
  parseCustomerAddressWriteBody,
} from "@/lib/customer/customerAddresses";

describe("parseCustomerAddressWriteBody", () => {
  it("accepts valid create body", () => {
    const parsed = parseCustomerAddressWriteBody({
      label: "Home",
      line1: "12 Ocean View",
      suburb: "Claremont",
      isDefault: true,
    });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.label).toBe("Home");
      expect(parsed.value.city).toBe("Cape Town");
      expect(parsed.value.isDefault).toBe(true);
    }
  });

  it("rejects short label", () => {
    const parsed = parseCustomerAddressWriteBody({
      label: "",
      line1: "12 Ocean View",
      suburb: "Claremont",
    });
    expect(parsed.ok).toBe(false);
  });

  it("ignores foreign userId in body (caller must strip; parser does not set user)", () => {
    const parsed = parseCustomerAddressWriteBody({
      label: "Home",
      line1: "12 Ocean View",
      suburb: "Claremont",
      userId: "22222222-2222-4222-8222-222222222222",
      user_id: "22222222-2222-4222-8222-222222222222",
    });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value).not.toHaveProperty("userId");
      expect(parsed.value).not.toHaveProperty("user_id");
    }
  });
});

describe("customerOwnsAddressRow authz", () => {
  const owner = "11111111-1111-4111-8111-111111111111";
  const other = "22222222-2222-4222-8222-222222222222";

  it("allows owner", () => {
    expect(customerOwnsAddressRow({ user_id: owner }, owner)).toBe(true);
  });

  it("denies other user", () => {
    expect(customerOwnsAddressRow({ user_id: other }, owner)).toBe(false);
  });

  it("denies missing row", () => {
    expect(customerOwnsAddressRow(null, owner)).toBe(false);
  });
});
