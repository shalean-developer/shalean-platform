import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, "../../..");

const r = (rel: string) => readFileSync(path.join(webRoot, rel), "utf8");

/**
 * M-22 — mobile QA pass for the office redesign payouts + metrics pages.
 * Legacy `/admin/payouts` and `/admin/metrics` were replaced by
 * `/office/payouts` and `/office/metrics`.
 */
const PAYOUTS = "app/(ui-redesign)/office/payouts/page.tsx";
const METRICS = "app/(ui-redesign)/office/metrics/page.tsx";

describe("M-22 — office payouts page mobile contract", () => {
  const src = r(PAYOUTS);

  it("root shell avoids horizontal overflow on narrow viewports", () => {
    expect(src).toMatch(/min-w-0 max-w-full[^"]*overflow-x-hidden/);
  });

  it("tables scroll horizontally instead of forcing page overflow", () => {
    expect(src).toMatch(/overflow-x-auto/);
  });

  it("uses stacked flex layouts for controls on phones", () => {
    expect(src).toMatch(/flex flex-col[^"]*sm:flex-row/);
  });

  it("does NOT change payout logic — only layout markup", () => {
    expect(src).toMatch(/\/api\/admin\/payouts\/period-report/);
    expect(src).toMatch(/\/api\/admin\/payouts\/generate/);
  });
});

describe("M-22 — office dispatch-metrics page mobile contract", () => {
  const src = r(METRICS);

  it("metric cards use a responsive grid (single column on phones)", () => {
    expect(src).toMatch(/grid gap-4 sm:grid-cols-2/);
  });

  it("team capacity uses stacked cards instead of a fixed-width table", () => {
    expect(src).not.toMatch(/min-w-\[720px\]/);
    expect(src).toMatch(/teams\.map\(\(t\)/);
    expect(src).toMatch(/utilizationLabelText\(t\.utilizationLabel\)/);
  });

  it("does NOT change dispatch-metrics behavior — only presentation", () => {
    expect(src).toMatch(/\/api\/admin\/dispatch-metrics/);
    expect(src).toMatch(/Assignment success/);
  });
});

describe("M-22 — both pages preserve desktop layouts", () => {
  it("payouts: keeps responsive table regions", () => {
    expect(r(PAYOUTS)).toMatch(/overflow-x-auto/);
  });

  it("metrics: keeps the xl four-column score-card grid", () => {
    expect(r(METRICS)).toMatch(/xl:grid-cols-4/);
  });
});
