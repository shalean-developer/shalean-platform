import { describe, expect, it } from "vitest";
import { canSpendDiscretionary, classifyBudgetCashPolicy } from "../budgetCashClassification";

describe("budget cash classification", () => {
  it("protects cleaner payouts", () => {
    expect(classifyBudgetCashPolicy("Cleaner payouts").cashClass).toBe("protected");
  });

  it("makes owner salary and marketing subject to Safe to Spend", () => {
    expect(classifyBudgetCashPolicy("Owner salary").requiresSafeToSpend).toBe(true);
    expect(classifyBudgetCashPolicy("Marketing").cashClass).toBe("discretionary");
  });

  it("treats fuel and supplies as booking-linked", () => {
    expect(classifyBudgetCashPolicy("Fuel").cashClass).toBe("booking_linked");
    expect(classifyBudgetCashPolicy("Cleaning supplies").cashClass).toBe("booking_linked");
  });
});

describe("discretionary spending gate", () => {
  it("blocks when bank balance is stale", () => {
    expect(canSpendDiscretionary({ requestedCents: 10000, safeToSpendCents: 50000, bankBalanceFresh: false }).allowed).toBe(false);
  });

  it("blocks spend above Safe to Spend", () => {
    expect(canSpendDiscretionary({ requestedCents: 60000, safeToSpendCents: 50000, bankBalanceFresh: true }).allowed).toBe(false);
  });

  it("allows spend within Safe to Spend", () => {
    expect(canSpendDiscretionary({ requestedCents: 10000, safeToSpendCents: 50000, bankBalanceFresh: true }).allowed).toBe(true);
  });
});
