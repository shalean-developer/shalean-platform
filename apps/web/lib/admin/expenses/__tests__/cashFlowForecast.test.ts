import { afterEach, describe, expect, it, vi } from "vitest";
import { buildCashFlowForecast, configuredMonthlyPayoutDay, expectedPayoutDate, type ForecastRow } from "../cashFlowForecast";
const invoice = (id: string, date: string | null, extra = {}): ForecastRow => ({ id, due_date: date, balance_cents: 10001, status: "sent", currency_code: "ZAR", ...extra });
const payout = (extra = {}): ForecastRow => ({ id: "p", status: "approved", total_amount_cents: 20002, period_start: "2026-10-01", period_end: "2026-10-31", ...extra });
const recurring = (extra = {}): ForecastRow => ({ id: "r", status: "active", amount_cents: 30003, frequency: "monthly", next_run_date: "2026-11-10", ...extra });
const build = (i: ForecastRow[] = [], p: ForecastRow[] = [], r: ForecastRow[] = [], g: ForecastRow[] = []) => buildCashFlowForecast("2026-11-01", "2026-11-30", i, p, r, g, 5);
afterEach(() => vi.unstubAllEnvs());
describe("selected-period forecast", () => {
  it("separates earlier invoices, includes boundaries and excludes later invoices", () => {
    const result = build([invoice("early", "2026-10-31"), invoice("first", "2026-11-01"), invoice("last", "2026-11-30"), invoice("later", "2026-12-01")]);
    expect(result.income_cents).toBe(20002); expect(result.earlier_income_cents).toBe(10001);
    expect(result.items.map(x => x.id)).toEqual(["early", "first", "last"]);
  });
  it("honours active agreed payment dates and preserves original records", () => {
    const i = invoice("a", "2026-10-10", { payment_arrangement_active: true, promised_payment_date: "2026-11-20" });
    expect(build([i]).income_cents).toBe(10001); expect(i.due_date).toBe("2026-10-10");
    expect(build([{ ...i, payment_arrangement_active: false }]).income_cents).toBe(0);
  });
  it("excludes paid, closed, draft, foreign currency and zero balances", () => {
    const result = build([invoice("paid", "2026-11-01", { status: "paid" }), invoice("closed", "2026-11-01", { is_closed: true }), invoice("draft", "2026-11-01", { status: "draft" }), invoice("usd", "2026-11-01", { currency_code: "USD" }), invoice("zero", "2026-11-01", { balance_cents: 0 })]);
    expect(result.income_cents).toBe(0); expect(result.issues).toHaveLength(1);
  });
  it("isolates missing and impossible dates", () => {
    const result = build([invoice("null", null), invoice("bad", "2026-02-30")]);
    expect(result.income_cents).toBe(0); expect(result.undated_income_cents).toBe(20002);
  });
  it("assigns payouts to following month, keeping earlier amounts separate", () => {
    const result = build([], [payout(), payout({id:"next",period_start:"2026-11-01",period_end:"2026-11-30"}), payout({id:"early",period_start:"2026-09-01",period_end:"2026-09-30"})]);
    expect(result.expenses_cents).toBe(20002); expect(result.earlier_expenses_cents).toBe(20002);
    expect(result.items.find(x => x.id === "p")?.date).toBe("2026-11-05");
  });
  it("excludes settled payouts and isolates non-monthly periods", () => {
    const result = build([], [payout({payment_status:"paid"}),payout({id:"paidAt",paid_at:"2026-11-01T00:00:00Z"}),payout({id:"legacy",period_start:"2026-10-07"})]);
    expect(result.expenses_cents).toBe(0); expect(result.undated_expenses_cents).toBe(20002);
  });
  it("uses configured payout policy across year boundaries", () => {
    vi.stubEnv("SHALEAN_MONTHLY_PAYOUT_DAY", "12"); expect(configuredMonthlyPayoutDay()).toBe(12);
    expect(expectedPayoutDate("2026-12-31", configuredMonthlyPayoutDay())).toBe("2027-01-12");
    vi.stubEnv("SHALEAN_MONTHLY_PAYOUT_DAY", "99"); expect(configuredMonthlyPayoutDay()).toBe(5);
  });
  it("counts every weekly occurrence", () => {
    expect(build([], [], [recurring({ frequency:"weekly",next_run_date:"2026-11-02" })]).expenses_cents).toBe(5 * 30003);
  });
  it("replaces generated occurrences, excluding approved outflows", () => {
    const g = {id:"generated",recurring_expense_id:"r",expense_date:"2026-11-10",status:"pending",amount_cents:12345};
    const result = build([], [], [recurring()], [g]); expect(result.expenses_cents).toBe(12345); expect(result.items).toHaveLength(1);
    expect(build([], [], [recurring()], [{...g,status:"approved"}]).expenses_cents).toBe(0);
  });
  it("flags duplicate generated occurrences", () => {
    const g = {id:"one",recurring_expense_id:"r",expense_date:"2026-11-10",status:"pending",amount_cents:12345};
    expect(build([],[],[],[g,{...g,id:"two"}]).issues).toHaveLength(1);
  });
  it("is idempotent, deduplicates identities and preserves inputs", () => {
    const i = [invoice("a","2026-11-10")]; const p = [payout()]; const r = [recurring()]; const before = JSON.stringify([i,p,r]); const first = build(i,p,r);
    expect(build(i,p,r)).toEqual(first); expect(JSON.stringify([i,p,r])).toBe(before);
    expect(build([...i,...i],p,r).income_cents).toBe(first.income_cents);
  });
  it("rejects invalid money and isolates missing schedule dates", () => {
    expect(build([invoice("bad","2026-11-01",{balance_cents:NaN})]).issues).toHaveLength(1);
    expect(build([],[],[recurring({next_run_date:null})]).undated_expenses_cents).toBe(30003);
  });
});
