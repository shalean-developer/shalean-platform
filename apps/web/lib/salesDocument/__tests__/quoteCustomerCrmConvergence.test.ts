import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("QUOTE-E2E-06 customer and CRM convergence", () => {
  it("allows valid email identity even when the phone is not a South African number", () => {
    const src = readFileSync(
      join(root, "lib/customer/ensureCustomerAccount.ts"),
      "utf8",
    );

    const emailValidation = src.indexOf("const emailNorm");
    const phoneNormalization = src.indexOf("const phoneNorm", emailValidation);
    const emailLookup = src.indexOf("const uidByEmail", phoneNormalization);

    expect(emailValidation).toBeGreaterThanOrEqual(0);
    expect(phoneNormalization).toBeGreaterThan(emailValidation);
    expect(emailLookup).toBeGreaterThan(phoneNormalization);
    expect(src).toContain("if (!emailNorm && !phoneNorm)");
    expect(src).toContain("phoneNorm ?? (phoneRaw || null)");
  });

  it("still blocks conflicting phone and email accounts", () => {
    const src = readFileSync(
      join(root, "lib/customer/ensureCustomerAccount.ts"),
      "utf8",
    );

    expect(src).toContain("uidByPhone && uidByEmail && uidByPhone !== uidByEmail");
    expect(src).toContain('"phone_email_account_conflict"');
  });

  it("uses the canonical sales-document customer helper for new quote requests", () => {
    const src = readFileSync(
      join(root, "lib/salesDocument/createCustomerQuoteRequest.ts"),
      "utf8",
    );

    expect(src).toContain("ensureSalesDocumentCustomer");
    expect(src).toContain('"customer_link_recovery_required"');
    expect(src).not.toContain("ensureCustomerAccount(admin");
  });

  it("classifies historical customer-link debt without name-only matching", () => {
    const src = readFileSync(
      join(root, "lib/salesDocument/quoteCustomerLinkRecovery.ts"),
      "utf8",
    );

    expect(src).toContain('"exact_existing_email"');
    expect(src).toContain('"recoverable_by_email"');
    expect(src).toContain('"blocked"');
    expect(src).toContain('.eq("billing_email", email)');
    expect(src).not.toContain("full_name");
  });

  it("repairs eligible rows only through ensureSalesDocumentCustomer", () => {
    const src = readFileSync(
      join(root, "lib/salesDocument/quoteCustomerLinkRecovery.ts"),
      "utf8",
    );

    expect(src).toContain('row.classification !== "blocked"');
    expect(src).toContain("ensureSalesDocumentCustomer(admin, row.document_id)");
  });

  it("requires explicit admin confirmation and exposes the recovery in Leads & sales", () => {
    const route = readFileSync(
      join(root, "app/api/admin/sales-documents/customer-link-recovery/route.ts"),
      "utf8",
    );
    const page = readFileSync(
      join(root, "app/(ui-redesign)/office/sales-documents/page.tsx"),
      "utf8",
    );

    expect(route).toContain('"REPAIR_QUOTE_CUSTOMER_LINKS"');
    expect(page).toContain("Customer link recovery");
    expect(page).toContain("Repair customer links");
    expect(page).toContain("No customer email will be sent and quote pricing/status will not change.");
  });
});
