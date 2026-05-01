import { describe, expect, it } from "vitest";

const MISMATCH_EPS_ZAR = 2;

function amountMismatch(paidZar: number, expectedZar: number): boolean {
  return Math.abs(paidZar - expectedZar) > MISMATCH_EPS_ZAR;
}

describe("payment amount vs checkout snapshot (eps)", () => {
  it("treats as mismatch when diff exceeds 2 ZAR", () => {
    expect(amountMismatch(100, 150)).toBe(true);
    expect(amountMismatch(100, 103.1)).toBe(true);
  });

  it("allows within epsilon", () => {
    expect(amountMismatch(100, 101)).toBe(false);
    expect(amountMismatch(100, 100)).toBe(false);
  });
});
