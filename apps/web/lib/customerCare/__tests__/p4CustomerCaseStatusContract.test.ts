import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..", "..", "..", "..");
const read = (rel: string) => readFileSync(path.join(REPO_ROOT, rel), "utf8");

describe("P4 customer case status privacy", () => {
  it("requires authenticated customer context and scopes by user id/email", () => {
    const src = read("apps/web/app/api/customer/cases/route.ts");
    expect(src).toContain("authenticateCustomerBookingRequest");
    expect(src).toContain('.eq("customer_id", auth.userId)');
    expect(src).toContain('.eq("customer_email", email)');
  });

  it("exposes only customer-safe case fields", () => {
    const src = read("apps/web/app/api/customer/cases/route.ts");
    expect(src).toContain("PUBLIC_FIELDS");
    for (const privateField of ["description", "assigned_to", "created_by", "refund_accounting_id", "credit_amount_cents", "evidence", "metadata"]) {
      expect(src.match(new RegExp(`PUBLIC_FIELDS[^\\n]*${privateField}`))).toBeNull();
    }
    expect(src).toContain("resolution_summary");
    expect(src).toContain("resolution_due_at");
  });
});
