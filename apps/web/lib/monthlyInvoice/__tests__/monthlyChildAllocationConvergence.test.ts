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
const settlementCommand = path.join(monthlyInvoiceDir, "settleMonthlyInvoiceChildBooking.ts");

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

  it("settlement paths use the named monthly child settlement command boundary", () => {
    for (const p of [apply, finalize, manual]) {
      const src = readFileSync(p, "utf8");
      expect(src, `${path.basename(p)} must import settlement command`).toContain(
        "settleMonthlyInvoiceChildBooking",
      );
      expect(src, `${path.basename(p)} must pass allocator output to settlement command`).toMatch(
        /amountPaidCents:\s*allocatedCents/,
      );
      expect(src, `${path.basename(p)} must pass frozen payout basis to settlement command`).toMatch(
        /payoutFrozenCents:\s*frozen/,
      );
    }
  });

  it("only the monthly child settlement command writes payment and payout settlement columns", () => {
    const commandSrc = readFileSync(settlementCommand, "utf8");
    expect(commandSrc).toMatch(/export\s+async\s+function\s+settleMonthlyInvoiceChildBooking\s*\(/);
    expect(commandSrc).toMatch(/\.from\("bookings"\)[\s\S]*?\.update\(\s*\{/);
    expect(commandSrc).toMatch(/payment_status:\s*"success"/);
    expect(commandSrc).toMatch(/amount_paid_cents:\s*params\.amountPaidCents/);
    expect(commandSrc).toMatch(/payout_status:\s*"eligible"/);
    expect(commandSrc).toMatch(/payout_frozen_cents:\s*params\.payoutFrozenCents/);

    for (const p of [apply, finalize, manual]) {
      const src = readFileSync(p, "utf8");
      expect(src, `${path.basename(p)} must not directly update payment_status`).not.toMatch(
        /\.from\("bookings"\)[\s\S]*?\.update\(\s*\{[\s\S]*?payment_status:\s*"success"/,
      );
      expect(src, `${path.basename(p)} must not directly update payout_status`).not.toMatch(
        /\.from\("bookings"\)[\s\S]*?\.update\(\s*\{[\s\S]*?payout_status:\s*"eligible"/,
      );
      expect(src, `${path.basename(p)} must not directly update payout_frozen_cents`).not.toMatch(
        /\.from\("bookings"\)[\s\S]*?\.update\(\s*\{[\s\S]*?payout_frozen_cents:/,
      );
    }
  });

  it("applyMonthlyInvoicePayment settles through the command with amount_paid_cents from the allocator", () => {
    const src = readFileSync(apply, "utf8");
    const commandCall = src.match(
      /settleMonthlyInvoiceChildBooking\(\s*admin\s*,\s*\{[\s\S]*?amountPaidCents:\s*([^,\n}]+)/,
    );
    expect(commandCall, "expected settleMonthlyInvoiceChildBooking call").toBeTruthy();
    if (commandCall) {
      expect(commandCall[1].trim()).toBe("allocatedCents");
    }
  });
});
