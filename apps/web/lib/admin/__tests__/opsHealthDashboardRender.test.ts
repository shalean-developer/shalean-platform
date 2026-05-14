import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { OpsHealthDashboard, type OpsHealthPayload } from "@/components/admin/OpsHealthDashboard";

function payload(overrides: Partial<OpsHealthPayload> = {}): OpsHealthPayload {
  return {
    ok: true,
    status: "healthy",
    degraded: false,
    generatedAt: "2026-05-14T10:00:00.000Z",
    lastScan: {
      source: "production_health",
      scanLimit: 500,
      metricsRecorded: false,
      degraded: false,
    },
      counts: {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
        info: 0,
        totalFindings: 0,
        acknowledgedHidden: 0,
      },
      summaries: [],
      acknowledgedSummaries: [],
      acknowledgements: [],
      sampleIds: {},
      ...overrides,
  };
}

function render(data: OpsHealthPayload): string {
  return renderToStaticMarkup(React.createElement(OpsHealthDashboard, { data }));
}

describe("OpsHealthDashboard", () => {
  it("renders healthy empty state and severity counts", () => {
    const html = render(payload());

    expect(html).toContain("Ops health: Healthy");
    expect(html).toContain("No scanner findings in this run.");
    expect(html).toContain("Limit 500");
    expect(html).toContain("critical");
    expect(html).toContain("medium");
  });

  it("renders critical findings with safe sample ids", () => {
    const html = render(
      payload({
        status: "critical",
        counts: { critical: 2, high: 0, medium: 0, low: 0, info: 0, totalFindings: 2, acknowledgedHidden: 0 },
        summaries: [
          {
            code: "payment_verified_not_finalized",
            severity: "critical",
            count: 2,
            message: "Verified payment was not finalized.",
            sampleIds: ["00000000-0000-4000-8000-00000000abcd"],
          },
        ],
        sampleIds: {
          payment_verified_not_finalized: ["00000000-0000-4000-8000-00000000abcd"],
        },
      }),
    );

    expect(html).toContain("Ops health: Critical");
    expect(html).toContain("payment_verified_not_finalized");
    expect(html).toContain("Verified payment was not finalized.");
    expect(html).toContain("00000000...00abcd");
  });

  it("renders degraded scanner state and error note", () => {
    const html = render(
      payload({
        status: "degraded",
        degraded: true,
        error: "scanner unavailable",
        lastScan: {
          source: "production_health",
          scanLimit: 50,
          metricsRecorded: true,
          degraded: true,
        },
      }),
    );

    expect(html).toContain("Ops health: Degraded");
    expect(html).toContain("Scanner note: scanner unavailable");
    expect(html).toContain("Limit 50");
    expect(html).toContain("metrics recorded");
    expect(html).toContain("degraded");
  });

  it("renders degraded scanner diagnostics", () => {
    const html = render(
      payload({
        status: "degraded",
        degraded: true,
        counts: { critical: 0, high: 1, medium: 0, low: 0, info: 0, totalFindings: 1, acknowledgedHidden: 0 },
        summaries: [
          {
            code: "scanner_query_failed",
            severity: "high",
            count: 1,
            message: "One or more Ops Health scanners could not read all required data.",
            sampleIds: ["payment_finalization_jobs"],
            diagnostics: {
              errors: [{ scanner: "payment_finalization_jobs", message: "failed_jobs unavailable", code: "PGRST500" }],
            },
          },
        ],
        sampleIds: { scanner_query_failed: ["payment_finalization_jobs"] },
      }),
    );

    expect(html).toContain("scanner_query_failed");
    expect(html).toContain("Diagnostics");
    expect(html).toContain("payment_finalization_jobs: failed_jobs unavailable (PGRST500)");
  });

  it("renders acknowledgement filtering controls and hidden count", () => {
    const html = renderToStaticMarkup(
      React.createElement(OpsHealthDashboard, {
        data: payload({
          counts: { critical: 0, high: 0, medium: 0, low: 0, info: 0, totalFindings: 0, acknowledgedHidden: 2 },
          acknowledgedSummaries: [
            {
              code: "payment_verified_not_finalized",
              severity: "critical",
              count: 2,
              message: "Known historical payment incident.",
              sampleIds: ["job-1", "job-2"],
              diagnostics: { acknowledged: true },
            },
          ],
        }),
        onToggleAcknowledged: () => undefined,
      }),
    );

    expect(html).toContain("2 acknowledged hidden");
    expect(html).toContain("Show acknowledged");
  });
});
