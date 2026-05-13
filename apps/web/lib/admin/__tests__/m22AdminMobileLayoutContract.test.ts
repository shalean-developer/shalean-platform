import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// __dirname == apps/web/lib/admin/__tests__
const webRoot = path.resolve(__dirname, "../../..");

const r = (rel: string) => readFileSync(path.join(webRoot, rel), "utf8");

/**
 * M-22 — mobile QA pass: keep `/admin/payouts` (Paystack-batches tab) and the
 * dispatch-themed `/admin/metrics` page usable at 320 / 375 / 390 / 768.
 *
 * Audit findings before this pass (captured by reading both pages at
 * conversation timestamp Tue May 12 2026):
 *   - `/admin/payouts` rendered the bookings detail table with
 *     `min-w-[820px] overflow-x-auto`, forcing every row into a horizontal
 *     scroll-strip on phones (no card alternative).
 *   - `/admin/payouts` toast was pinned `bottom-4 right-4`, colliding with the
 *     <md fixed bottom nav (admin layout, lines 393-409) so the message sat on
 *     top of nav targets at 320 / 375 / 390.
 *   - `/admin/payouts` payout-batch list used `max-h-[70vh]` even on phones,
 *     consuming most of the viewport and pushing the detail panel off-screen.
 *   - `/admin/payouts` status pills used `text-[10px]` uppercase, borderline
 *     unreadable at 320.
 *   - `/admin/metrics` rendered the team utilization table with
 *     `min-w-[720px] overflow-x-auto` only — no card alternative, table
 *     headers clipped on phones.
 *   - `/admin/metrics` `24h | 7d` window selector buttons were `px-3 py-1.5`
 *     ≈ 36px tall — under the 44px touch-target minimum (WCAG 2.5.5 / Apple
 *     HIG).
 *
 * Post-fix invariants this file guards. We assert against page source rather
 * than rendering the React tree, so the suite stays free of jsdom plumbing
 * (Supabase browser client, fetch, etc.) and never depends on dispatch /
 * payout runtime semantics — those are explicitly NOT touched by M-22.
 */

const PAYOUTS = "app/admin/payouts/page.tsx";
const METRICS = "app/admin/metrics/page.tsx";

describe("M-22 — admin payouts page mobile contract", () => {
  const src = r(PAYOUTS);

  it("desktop bookings table is hidden <md and only visible >=md", () => {
    // Strip the file down to just the bookings <table> block to avoid
    // matching unrelated `min-w` on neighbouring elements.
    const tableStart = src.indexOf('<table className="w-full min-w-[820px]');
    expect(tableStart).toBeGreaterThan(0);
    const wrapperStart = src.lastIndexOf("<div", tableStart);
    expect(wrapperStart).toBeGreaterThan(0);
    const wrapperOpenEnd = src.indexOf(">", wrapperStart);
    const wrapperOpen = src.slice(wrapperStart, wrapperOpenEnd + 1);
    // M-22 contract: this wrapper must be hidden on phones AND show again ≥md.
    expect(wrapperOpen).toMatch(/\bhidden\b/);
    expect(wrapperOpen).toMatch(/\bmd:block\b/);
    expect(wrapperOpen).toMatch(/\boverflow-x-auto\b/);
  });

  it("ships a mobile-only stacked card list for bookings (md:hidden + data-testid)", () => {
    expect(src).toMatch(/data-testid="payout-bookings-mobile"/);
    const ulStart = src.indexOf('data-testid="payout-bookings-mobile"');
    expect(ulStart).toBeGreaterThan(0);
    const ulOpen = src.lastIndexOf("<ul", ulStart);
    expect(ulOpen).toBeGreaterThan(0);
    const ulOpenEnd = src.indexOf(">", ulStart);
    const openTag = src.slice(ulOpen, ulOpenEnd + 1);
    expect(openTag).toMatch(/\bmd:hidden\b/);
    // Mobile card aria label (screen reader hint).
    expect(openTag).toMatch(/aria-label="Payout batch bookings \(mobile\)"/);
  });

  it("mobile bookings card surfaces the same per-booking financial totals as the table", () => {
    // The mobile <ul> renders all four totals (customer total / payout / bonus /
    // company) so dropping the table on phones does not lose data.
    expect(src).toMatch(/Customer total<\/dt>[\s\S]{0,400}customerTotalZar\(b\)/);
    expect(src).toMatch(/Cleaner payout<\/dt>[\s\S]{0,400}zarFromCents\(b\.cleaner_payout_cents\)/);
    expect(src).toMatch(/Bonus<\/dt>[\s\S]{0,400}zarFromCents\(b\.cleaner_bonus_cents\)/);
    expect(src).toMatch(/Company<\/dt>[\s\S]{0,400}zarFromCents\(b\.company_revenue_cents\)/);
  });

  it("mobile bookings card preserves the TEST badge so test bookings cannot hide on phones", () => {
    // Ensure the mobile branch still surfaces b.is_test prominently.
    const ulStart = src.indexOf('data-testid="payout-bookings-mobile"');
    const ulEnd = src.indexOf("</ul>", ulStart);
    const block = src.slice(ulStart, ulEnd);
    expect(block).toMatch(/\{b\.is_test \?/);
    expect(block).toMatch(/TEST/);
  });

  it("payout-batches list scroll cap is phone-friendly (60vh) and only relaxes >=sm", () => {
    expect(src).toMatch(/max-h-\[60vh\][^"]*\bsm:max-h-\[70vh\]/);
    // Sanity: no surviving plain `max-h-[70vh]` on the batches list.
    expect(src).not.toMatch(/className="max-h-\[70vh\] divide-y/);
  });

  it("toast lives above the mobile bottom nav on phones (`bottom-20`) and falls back to `bottom-4` >=md", () => {
    // The admin layout pins a fixed bottom nav with `bottom-0` <md (see
    // apps/web/app/admin/layout.tsx). The toast must clear it.
    expect(src).toMatch(/fixed bottom-20 right-4 z-50 max-w-sm md:bottom-4/);
  });

  it("status pills bumped from text-[10px] to text-[11px] for legibility at 320 / 375", () => {
    // Three pill sites: list-row status, detail-header status, payment status.
    // None of them should still be at the unreadable [10px] size.
    expect(src).not.toMatch(/text-\[10px\]/);
    // At least three [11px] pill occurrences (list, detail header, payment).
    const elevenPx = src.match(/text-\[11px\] font-bold/g) ?? [];
    expect(elevenPx.length).toBeGreaterThanOrEqual(3);
  });

  it("does NOT change payout logic — only adds responsive markup", () => {
    // Guard rail: M-22 must not touch the action handlers / API paths.
    expect(src).toMatch(/\/api\/admin\/payouts\/backfill-missing/);
    expect(src).toMatch(/\/api\/admin\/payouts\/generate/);
    expect(src).toMatch(/postAction\(approvePath/);
    expect(src).toMatch(/postAction\(payPath/);
    // No silent removal of the test-batch guard banner.
    expect(src).toMatch(/This batch contains \{totals\.tests\} test booking\(s\)\./);
  });
});

describe("M-22 — admin dispatch-metrics page mobile contract", () => {
  const src = r(METRICS);

  it("window selector buttons hit a >=44px touch target on mobile", () => {
    // Spot-check the rendered className on the 24h / 7d toggle.
    expect(src).toMatch(/min-h-\[44px\] rounded-md px-3 py-2 text-sm font-medium transition sm:min-h-0 sm:py-1\.5/);
  });

  it("desktop team-utilization table is hidden <md and only visible >=md", () => {
    const tableStart = src.indexOf('<table className="w-full min-w-[720px] border-collapse text-sm">');
    expect(tableStart).toBeGreaterThan(0);
    const wrapperStart = src.lastIndexOf("<div", tableStart);
    expect(wrapperStart).toBeGreaterThan(0);
    const wrapperOpenEnd = src.indexOf(">", wrapperStart);
    const wrapperOpen = src.slice(wrapperStart, wrapperOpenEnd + 1);
    expect(wrapperOpen).toMatch(/\bhidden\b/);
    expect(wrapperOpen).toMatch(/\bmd:block\b/);
    expect(wrapperOpen).toMatch(/\boverflow-x-auto\b/);
  });

  it("ships a mobile-only stacked card list for team utilization", () => {
    expect(src).toMatch(/data-testid="team-utilization-mobile"/);
    const ulStart = src.indexOf('data-testid="team-utilization-mobile"');
    expect(ulStart).toBeGreaterThan(0);
    const ulOpen = src.lastIndexOf("<ul", ulStart);
    expect(ulOpen).toBeGreaterThan(0);
    const ulOpenEnd = src.indexOf(">", ulStart);
    const openTag = src.slice(ulOpen, ulOpenEnd + 1);
    expect(openTag).toMatch(/\bmd:hidden\b/);
    expect(openTag).toMatch(/aria-label="Team utilization \(mobile\)"/);
  });

  it("mobile team utilization card surfaces every column the desktop table shows", () => {
    const ulStart = src.indexOf('data-testid="team-utilization-mobile"');
    const ulEnd = src.indexOf("</ul>", ulStart);
    const block = src.slice(ulStart, ulEnd);
    // Team name, utilization label, jobs/capacity, roster, utilization %, at-capacity flag.
    expect(block).toMatch(/\{row\.name\}/);
    expect(block).toMatch(/utilizationLabelText\(row\.utilizationLabel\)/);
    expect(block).toMatch(/\{row\.jobsToday\}\s*\/\s*\{row\.capacityPerDay\}/);
    expect(block).toMatch(/\{row\.activeMembersToday\}/);
    expect(block).toMatch(/row\.utilization != null \? pct\(row\.utilization, 0\) : "—"/);
    expect(block).toMatch(/\{row\.atCapacity \?/);
    expect(block).toMatch(/At capacity/);
  });

  it("mobile team utilization card uses readable badge sizing (>=text-[11px])", () => {
    const ulStart = src.indexOf('data-testid="team-utilization-mobile"');
    const ulEnd = src.indexOf("</ul>", ulStart);
    const block = src.slice(ulStart, ulEnd);
    expect(block).not.toMatch(/text-\[10px\]/);
    expect(block).toMatch(/text-\[11px\]/);
  });

  it("does NOT change dispatch-metrics behavior — only adds responsive markup", () => {
    // Guard rail: API path, attempt sources, utilization timezone etc. untouched.
    expect(src).toMatch(/\/api\/admin\/dispatch-metrics\?window=\$\{encodeURIComponent\(w\)\}/);
    expect(src).toMatch(/DISPATCH_METRICS_UTILIZATION_TIMEZONE/);
    expect(src).toMatch(/attemptSources\.join\(", "\)/);
    // Sanity check: the score cards are still rendered (not accidentally gated).
    expect(src).toMatch(/Assignment success/);
    expect(src).toMatch(/Failure rate/);
    expect(src).toMatch(/No-candidate rate/);
  });
});

describe("M-22 — both pages preserve their desktop layouts", () => {
  it("payouts: keeps the lg two-column shell (`lg:grid-cols-[360px_1fr]`)", () => {
    expect(r(PAYOUTS)).toMatch(/grid gap-4 lg:grid-cols-\[360px_1fr\]/);
  });

  it("payouts: keeps the desktop bookings table behind `md:block`", () => {
    expect(r(PAYOUTS)).toMatch(/min-w-\[820px\] text-left text-sm/);
  });

  it("metrics: keeps the lg three-column score-card grid (`lg:grid-cols-3`)", () => {
    expect(r(METRICS)).toMatch(/grid gap-4 sm:grid-cols-2 lg:grid-cols-3/);
  });

  it("metrics: keeps the desktop team-utilization table behind `md:block`", () => {
    expect(r(METRICS)).toMatch(/min-w-\[720px\] border-collapse text-sm/);
  });
});
