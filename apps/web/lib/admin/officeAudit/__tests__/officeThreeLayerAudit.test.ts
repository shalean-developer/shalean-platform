import { describe, expect, it } from "vitest";
import {
  compareMetricLayers,
  buildOfficeAuditDecision,
  emptyLayer,
  valueLayer,
} from "@/lib/admin/officeAudit/compareLayers";
import {
  averageBookingValueZar,
  detectStaleFetchedAt,
  isEmptyUiState,
  johannesburgDayBounds,
  johannesburgYmd,
  normalizeMetricValue,
  normalizeStatusLabel,
  parseDecimalDisplay,
  parseIntegerDisplay,
  parsePercentageDisplay,
  parseZarDisplay,
  startsWithinTwoHours,
} from "@/lib/admin/officeAudit/parseValues";
import {
  independentClassifyOps,
  independentOverdueZar,
  independentPaymentDayRevenue,
  independentPendingZar,
  independentRevenueEligible,
  independentScheduleStats,
  independentStatusLabel,
} from "@/lib/admin/officeAudit/independentCalculations";
import { assertNoSensitiveLeak, redactAuditValue, redactString } from "@/lib/admin/officeAudit/redactAudit";
import {
  assertOfficeAuditMayRun,
  createReadOnlyFetch,
  loadOfficeAuditSafetyFromEnv,
  officeAuditShouldFailProcess,
  shouldBlockBrowserWrite,
} from "@/lib/admin/officeAudit/safety";
import { getOfficeMetricRegistry } from "@/lib/admin/officeAudit/metricRegistry";
import type { MetricRegistryEntry } from "@/lib/admin/officeAudit/types";

const baseEntry: MetricRegistryEntry = {
  metricId: "test.metric",
  uiLabel: "Test",
  pageSection: "todays_operations",
  testId: "t",
  valueKind: "integer",
  uiFormattingRule: "integer",
  applicationSource: { notes: "" },
  databaseSource: { table: "bookings", columns: [], filters: "", joins: "", notes: "" },
  authoritativeCalculationId: "x",
  timezone: "Africa/Johannesburg",
  comparisonRule: "exact",
  tolerance: 0,
  required: true,
  businessRuleExplanation: "test",
};

describe("office three-layer audit parsers", () => {
  it("parses integers including zero and empty UI states", () => {
    expect(parseIntegerDisplay("12")).toBe(12);
    expect(parseIntegerDisplay(0)).toBe(0);
    expect(parseIntegerDisplay("0")).toBe(0);
    expect(parseIntegerDisplay("—")).toBeNull();
    expect(parseIntegerDisplay("…")).toBeNull();
    expect(isEmptyUiState("—")).toBe(true);
  });

  it("parses decimals and percentages", () => {
    expect(parseDecimalDisplay("12.5")).toBe(12.5);
    expect(parsePercentageDisplay("12.5%")).toBe(12.5);
    expect(parsePercentageDisplay("0%")).toBe(0);
  });

  it("parses South African rand displays", () => {
    expect(parseZarDisplay("R 1 234")).toBe(1234);
    expect(parseZarDisplay("R1,234")).toBe(1234);
    expect(parseZarDisplay("Visit paid value R 0")).toBe(0);
    expect(parseZarDisplay(0)).toBe(0);
    expect(normalizeMetricValue("zar_rand", "R 1 234.4")).toBe(1234);
  });

  it("normalizes status labels", () => {
    expect(normalizeStatusLabel("In_Progress")).toBe("in progress");
  });
});

describe("timezone and window rules", () => {
  it("computes Africa/Johannesburg day bounds at midnight", () => {
    const { startIso, endExclusiveIso } = johannesburgDayBounds("2026-07-25");
    expect(startIso).toBe("2026-07-24T22:00:00.000Z");
    expect(endExclusiveIso).toBe("2026-07-25T22:00:00.000Z");
  });

  it("formats johannesburg YMD", () => {
    const ymd = johannesburgYmd(new Date("2026-07-25T21:30:00.000Z"));
    expect(ymd).toBe("2026-07-25");
    const next = johannesburgYmd(new Date("2026-07-25T22:00:00.000Z"));
    expect(next).toBe("2026-07-26");
  });

  it("detects starting within two hours", () => {
    const now = new Date("2026-07-25T08:00:00+02:00").getTime();
    expect(startsWithinTwoHours("2026-07-25", "09:30", now)).toBe(true);
    expect(startsWithinTwoHours("2026-07-25", "11:00", now)).toBe(false);
    expect(startsWithinTwoHours("2026-07-25", "07:00", now)).toBe(false);
  });

  it("detects stale fetchedAt", () => {
    const now = Date.parse("2026-07-25T12:00:00.000Z");
    expect(detectStaleFetchedAt(new Date(now - 6 * 60_000).toISOString(), now)).toBe(true);
    expect(detectStaleFetchedAt(new Date(now - 60_000).toISOString(), now)).toBe(false);
    expect(detectStaleFetchedAt(null, now)).toBe(true);
  });
});

describe("independent calculations", () => {
  it("excludes cancelled and expired from schedule total", () => {
    const stats = independentScheduleStats([
      { status: "completed", cleaner_id: "c1" },
      { status: "cancelled" },
      { status: "payment_expired" },
      { status: "pending", cleaner_id: null },
      { status: "pending", selected_cleaner_id: "pref" },
      { status: "assigned", cleaner_id: "c2" },
    ]);
    expect(stats.cancelled).toBe(2);
    expect(stats.completed).toBe(1);
    expect(stats.unassigned).toBe(2);
    expect(stats.upcoming).toBe(1);
    expect(stats.total).toBe(4);
  });

  it("treats null payment fields as not revenue eligible", () => {
    expect(
      independentRevenueEligible({
        payment_status: null,
        payment_completed_at: null,
        amount_paid_cents: 10000,
        status: "paid",
      }),
    ).toBe(false);
  });

  it("computes overdue invoices and pending bookings", () => {
    expect(
      independentOverdueZar([
        { status: "overdue", balance_cents: 5000 },
        { is_overdue: true, balance_cents: 2500 },
        { status: "draft", balance_cents: 9999 },
        { status: "overdue", balance_cents: 0 },
      ]),
    ).toBe(75);
    expect(
      independentPendingZar([
        { status: "pending_payment", payment_status: "pending", total_price: 100 },
        { status: "pending_payment", payment_status: "pending_payment", amount_paid_cents: 2500 },
      ]),
    ).toBe(125);
  });

  it("computes average booking value", () => {
    expect(averageBookingValueZar(300, 2)).toBe(150);
    expect(averageBookingValueZar(0, 0)).toBe(0);
    const rev = independentPaymentDayRevenue(
      [
        {
          payment_status: "success",
          payment_completed_at: "2026-07-25T10:00:00+02:00",
          amount_paid_cents: 20000,
          status: "completed",
        },
        {
          payment_status: "success",
          payment_completed_at: "2026-07-25T11:00:00+02:00",
          amount_paid_cents: 10000,
          status: "completed",
        },
      ],
      new Date("2026-07-25T15:00:00+02:00"),
    );
    expect(rev.paidBookingsToday).toBe(2);
    expect(rev.revenueTodayZar).toBe(300);
    expect(rev.avgBookingValueZar).toBe(150);
  });

  it("classifies starting-soon and preferred status", () => {
    const now = new Date("2026-07-25T08:00:00+02:00").getTime();
    expect(
      independentClassifyOps(
        {
          status: "pending",
          date: "2026-07-25",
          time: "09:00",
          cleaner_id: null,
          team_id: null,
          dispatch_status: "searching",
          total_paid_zar: 0,
          amount_paid_cents: 0,
        },
        now,
      ),
    ).toBe("starting-soon");
    expect(independentStatusLabel({ status: "pending", selected_cleaner_id: "x" })).toBe("preferred");
  });
});

describe("compare layers", () => {
  it("PASS on exact three-layer match", () => {
    const result = compareMetricLayers(
      baseEntry,
      valueLayer("ui", 3),
      valueLayer("app", 3),
      valueLayer("db", 3),
    );
    expect(result.status).toBe("PASS");
  });

  it("FAIL on UI/API mismatch", () => {
    const result = compareMetricLayers(
      baseEntry,
      valueLayer("ui", 1),
      valueLayer("app", 2),
      valueLayer("db", 2),
    );
    expect(result.status).toBe("FAIL");
    expect(result.mismatchSource).toMatch(/UI/);
  });

  it("FAIL on API/database mismatch", () => {
    const result = compareMetricLayers(
      baseEntry,
      valueLayer("ui", 2),
      valueLayer("app", 2),
      valueLayer("db", 9),
    );
    expect(result.status).toBe("FAIL");
    expect(result.mismatchSource).toMatch(/server aggregation|API|database/i);
  });

  it("BLOCKED when a layer is unavailable", () => {
    const result = compareMetricLayers(
      baseEntry,
      emptyLayer("ui", "unavailable"),
      valueLayer("app", 2),
      valueLayer("db", 2),
    );
    expect(result.status).toBe("BLOCKED");
  });

  it("NOT AUTHORITATIVE when annotated", () => {
    const result = compareMetricLayers(
      baseEntry,
      valueLayer("ui", "healthy"),
      valueLayer("app", "healthy", "NOT AUTHORITATIVE"),
      valueLayer("db", "healthy", "NOT AUTHORITATIVE"),
    );
    expect(result.status).toBe("NOT AUTHORITATIVE");
  });

  it("decision is NO-GO unless every metric PASSes", () => {
    const pass = compareMetricLayers(baseEntry, valueLayer("ui", 1), valueLayer("app", 1), valueLayer("db", 1));
    const blocked = compareMetricLayers(baseEntry, emptyLayer("ui", "x"), valueLayer("app", 1), valueLayer("db", 1));
    expect(buildOfficeAuditDecision([pass]).decision).toBe("GO");
    expect(buildOfficeAuditDecision([pass, blocked]).decision).toBe("NO-GO");
  });
});

describe("redaction and safety", () => {
  it("redacts PII and credentials", () => {
    const redacted = redactAuditValue({
      email: "person@example.com",
      booking_id: "11111111-1111-4111-8111-111111111111",
      note: "call +27821234567",
      token: "secret",
    }) as Record<string, unknown>;
    expect(redacted.email).toBe("[REDACTED]");
    expect(redacted.booking_id).toBe("[REDACTED]");
    expect(String(redacted.note)).toContain("[REDACTED_PHONE]");
    expect(redactString("Bearer abc.def.ghi")).toContain("[REDACTED]");
    expect(() => assertNoSensitiveLeak({ ok: true, n: 1 })).not.toThrow();
  });

  it("refuses production without read-only flag", () => {
    expect(() =>
      assertOfficeAuditMayRun({
        safety: { readOnly: false, target: "production", allowProduction: false },
        baseUrl: "https://shalean.co.za",
      }),
    ).toThrow(/READ_ONLY/);
    expect(() =>
      assertOfficeAuditMayRun({
        safety: { readOnly: true, target: "production", allowProduction: true },
        baseUrl: "https://shalean.co.za",
      }),
    ).not.toThrow();
  });

  it("blocks production writes via read-only fetch wrapper", async () => {
    const attempts = { count: 0 };
    const f = createReadOnlyFetch(attempts);
    await expect(f("https://example.com/api", { method: "POST", body: "{}" })).rejects.toThrow(/blocked/i);
    await expect(
      f("https://xyz.supabase.co/rest/v1/bookings", { method: "PATCH", body: "{}" }),
    ).rejects.toThrow(/blocked/i);
    await expect(
      f("https://xyz.supabase.co/rest/v1/bookings", { method: "DELETE" }),
    ).rejects.toThrow(/blocked/i);
    expect(attempts.count).toBe(3);
    expect(
      loadOfficeAuditSafetyFromEnv({
        NODE_ENV: "test",
        OFFICE_AUDIT_READ_ONLY: "true",
        OFFICE_AUDIT_TARGET: "production",
      } as NodeJS.ProcessEnv),
    ).toEqual({
      readOnly: true,
      target: "production",
      allowProduction: true,
    });
  });

  it("blocks browser business writes but allows auth session POSTs", () => {
    expect(shouldBlockBrowserWrite("POST", "https://shalean.co.za/api/admin/assign")).toBe(true);
    expect(shouldBlockBrowserWrite("PUT", "https://shalean.co.za/api/admin/bookings/x")).toBe(true);
    expect(shouldBlockBrowserWrite("DELETE", "https://shalean.co.za/api/admin/payouts/1")).toBe(true);
    expect(shouldBlockBrowserWrite("POST", "https://xyz.supabase.co/auth/v1/token?grant_type=password")).toBe(
      false,
    );
    expect(shouldBlockBrowserWrite("POST", "https://shalean.co.za/login")).toBe(false);
    expect(shouldBlockBrowserWrite("GET", "https://shalean.co.za/office")).toBe(false);
  });

  it("incomplete evidence forces nonzero process exit", () => {
    expect(
      officeAuditShouldFailProcess(
        {
          FAIL: 0,
          BLOCKED: 33,
          "NOT AUTHORITATIVE": 1,
          "NOT IMPLEMENTED": 0,
          "SKIPPED WITH JUSTIFICATION": 0,
        },
        "NO-GO",
      ),
    ).toBe(true);
    expect(
      officeAuditShouldFailProcess(
        {
          FAIL: 0,
          BLOCKED: 0,
          "NOT AUTHORITATIVE": 0,
          "NOT IMPLEMENTED": 0,
          "SKIPPED WITH JUSTIFICATION": 0,
        },
        "GO",
      ),
    ).toBe(false);
    expect(
      officeAuditShouldFailProcess(
        {
          FAIL: 0,
          BLOCKED: 0,
          "NOT AUTHORITATIVE": 1,
          "NOT IMPLEMENTED": 0,
          "SKIPPED WITH JUSTIFICATION": 0,
        },
        "NO-GO",
      ),
    ).toBe(true);
  });
});

describe("registry", () => {
  it("registers required office metrics with Africa/Johannesburg defaults", () => {
    const registry = getOfficeMetricRegistry();
    expect(registry.length).toBeGreaterThanOrEqual(30);
    expect(registry.every((m) => m.tolerance === 0 || Boolean(m.toleranceJustification))).toBe(true);
    expect(registry.some((m) => m.metricId === "ops.total_bookings_today")).toBe(true);
    expect(registry.some((m) => m.metricId === "summary.system_health")).toBe(true);
  });
});
