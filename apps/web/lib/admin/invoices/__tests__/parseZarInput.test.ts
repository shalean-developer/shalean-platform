import { describe, expect, it } from "vitest";

import { parseZarInput } from "../invoiceAdminFormatters";

describe("parseZarInput", () => {
  it("parses plain decimals", () => {
    expect(parseZarInput("150")).toBe(150);
    expect(parseZarInput("-75.50")).toBe(-75.5);
  });

  it("parses en-ZA spaced thousands", () => {
    expect(parseZarInput("-1 170.00")).toBe(-1170);
    expect(parseZarInput("1 170,50")).toBe(1170.5);
  });

  it("parses comma grouping with decimal point", () => {
    expect(parseZarInput("1,170.00")).toBe(1170);
  });

  it("rejects empty and zero", () => {
    expect(parseZarInput("")).toBeNull();
    expect(parseZarInput("0")).toBeNull();
    expect(parseZarInput("abc")).toBeNull();
  });
});
