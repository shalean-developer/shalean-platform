import { describe, expect, it, vi } from "vitest";

import { bulkDeleteAdminCustomerAccounts, updateAdminCustomerContact } from "@/lib/admin/adminCustomerDetail";

describe("updateAdminCustomerContact", () => {
  it("rejects short names", async () => {
    const admin = {
      auth: { admin: { getUserById: vi.fn(), updateUserById: vi.fn() } },
    };
    const result = await updateAdminCustomerContact(admin as never, "00000000-0000-4000-8000-000000000001", {
      full_name: "A",
      phone: "0821234567",
    });
    expect(result).toEqual({ ok: false, error: "Full name must be at least 2 characters." });
  });
});

describe("bulkDeleteAdminCustomerAccounts", () => {
  it("rejects empty selection", async () => {
    const result = await bulkDeleteAdminCustomerAccounts({} as never, []);
    expect(result).toEqual({ ok: false, status: 400, error: "Select at least one customer." });
  });
});
