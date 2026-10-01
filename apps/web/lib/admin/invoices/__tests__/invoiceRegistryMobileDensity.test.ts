import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("invoice registry mobile density", () => {
  it("uses short mobile description and keeps full desktop copy", () => {
    const src = readFileSync(
      join(root, "app/(ui-redesign)/office/invoices/page.tsx"),
      "utf8",
    );

    expect(src).toContain("All invoices and quotes in one place.");
    expect(src).toContain("sm:hidden");
    expect(src).toContain("sm:block");
  });

  it("wraps both filter groups on mobile instead of horizontal scrolling", () => {
    const src = readFileSync(
      join(root, "app/(ui-redesign)/office/invoices/page.tsx"),
      "utf8",
    );

    expect(src.match(/flex flex-wrap gap-1\.5 sm:-mx-1 sm:flex-nowrap/g)?.length).toBe(2);
    expect(src).toContain("text-[11px] font-semibold sm:shrink-0");
  });

  it("uses compact mobile invoice cards and actions", () => {
    const src = readFileSync(
      join(root, "app/(ui-redesign)/office/invoices/page.tsx"),
      "utf8",
    );

    expect(src).toContain("space-y-2.5 border-b border-slate-100 px-3.5 py-3");
    expect(src).toContain("text-[15px] font-semibold leading-tight");
    expect(src).toContain("text-[11px] font-semibold text-slate-700");
    expect(src).toContain("gap-1.5");
    expect(src).toContain("py-1 text-[11px]");
  });

  it("uses a compact three-column KPI grid on mobile", () => {
    const src = readFileSync(
      join(root, "app/(ui-redesign)/office/invoices/page.tsx"),
      "utf8",
    );

    expect(src).toContain("grid grid-cols-3 gap-2");
    expect(src).toContain("text-base font-bold");
    expect(src).toContain("hidden text-xs text-slate-500 sm:block");
    expect(src).not.toContain('min-w-[145px]');
  });
});
