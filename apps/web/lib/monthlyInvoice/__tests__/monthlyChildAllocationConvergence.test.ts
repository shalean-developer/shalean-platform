import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const monthlyInvoiceDir = path.resolve(__dirname, "..");

const apply = path.join(monthlyInvoiceDir, "applyMonthlyInvoicePayment.ts");
const finalize = path.join(monthlyInvoiceDir, "finalizeDueMonthlyInvoices.ts");
const manual = path.join(monthlyInvoiceDir, "markMonthlyInvoicePaidManual.ts");
const helper = path.join(monthlyInvoiceDir, "allocateMonthlyChildPaymentCents.ts");

/**
 * Production Readiness Audit H-1.
 *
 * Asserts that the three monthly invoice settlement paths converge on the
 * single per-booking allocator `allocateMonthlyChildPaymentCents`, and that
 * none of them inline the older expression
 *   `lineCents > 0 ? lineCents : b.amount_paid_cents ?? 0`
 * which would re-introduce the divergence H-1 fixed.
 */
describe("monthly child allocation convergence (H-1)", () => {
  it("the shared allocator file exists and exports a pure function", () => {
    const src = readFileSync(helper, "utf8");
    expect(src).toMatch(/export\s+function\s+allocateMonthlyChildPaymentCents\s*\(/);
    expect(src).not.toMatch(/import\s+.*supabase/i);
  });

  it("applyMonthlyInvoicePayment imports and uses allocateMonthlyChildPaymentCents", () => {
    const src = readFileSync(apply, "utf8");
    expect(src).toContain("allocateMonthlyChildPaymentCents");
    expect(src).toMatch(
      /from\s+["']@\/lib\/monthlyInvoice\/allocateMonthlyChildPaymentCents["']/,
    );
    expect(src).toMatch(/total_paid_zar/);
  });

  it("finalizeDueMonthlyInvoices imports and uses allocateMonthlyChildPaymentCents", () => {
    const src = readFileSync(finalize, "utf8");
    expect(src).toContain("allocateMonthlyChildPaymentCents");
  });

  it("markMonthlyInvoicePaidManual imports and uses allocateMonthlyChildPaymentCents", () => {
    const src = readFileSync(manual, "utf8");
    expect(src).toContain("allocateMonthlyChildPaymentCents");
  });

  it("no settlement path inlines the legacy ternary `lineCents > 0 ? lineCents : ...`", () => {
    const legacyTernary = /lineCents\s*>\s*0\s*\?\s*lineCents\s*:/;
    for (const p of [apply, finalize, manual]) {
      const src = readFileSync(p, "utf8");
      expect(src, `${path.basename(p)} must not inline legacy allocation ternary`).not.toMatch(
        legacyTernary,
      );
    }
  });

  it("applyMonthlyInvoicePayment writes payment_status='success' together with amount_paid_cents from the allocator", () => {
    const src = readFileSync(apply, "utf8");
    const updateBlock = src.match(
      /\.from\("bookings"\)[\s\S]*?\.update\(\s*\{[\s\S]*?payment_status:\s*"success"[\s\S]*?amount_paid_cents:\s*([^,\n}]+)/,
    );
    expect(updateBlock, "expected admin.from('bookings').update with payment_status='success'").toBeTruthy();
    if (updateBlock) {
      expect(updateBlock[1].trim()).toBe("allocatedCents");
    }
  });
});
