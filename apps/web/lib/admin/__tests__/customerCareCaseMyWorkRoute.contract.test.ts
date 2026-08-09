import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("Customer Care case My Work route", () => {
  it("requires customer.contact and filters through Office work-item policy", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "app/api/admin/my-work/customer-care-cases/route.ts"), "utf8");
    expect(source).toContain('permissions.has("customer.contact")');
    expect(source).toContain("canReceiveOfficeWorkItem");
    expect(source).toContain("customerCareCaseWorkItems");
  });
});
