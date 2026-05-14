import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AdminWarningList } from "@/components/admin/AdminWarningList";
import type { AdminWarning } from "@/lib/admin/adminWarningPayload";

describe("AdminWarningList", () => {
  it("renders canonical warning severity, blocking state, code, and message", () => {
    const warnings: AdminWarning[] = [
      {
        code: "admin.delete.financial_booking_blocked",
        domain: "delete",
        severity: "critical",
        action: "blocked",
        blocking: true,
        message: "Financially sensitive bookings cannot be deleted.",
        fields: ["payment_status"],
      },
    ];

    const html = renderToStaticMarkup(<AdminWarningList warnings={warnings} />);

    expect(html).toContain("critical");
    expect(html).toContain("Blocking");
    expect(html).toContain("admin.delete.financial_booking_blocked");
    expect(html).toContain("Financially sensitive bookings cannot be deleted.");
    expect(html).toContain("Fields: payment_status");
  });

  it("renders advisory warnings distinctly from blocking warnings", () => {
    const warnings: AdminWarning[] = [
      {
        code: "admin.assignment.duration_fallback_used",
        domain: "assignment",
        severity: "medium",
        action: "diagnostic_only",
        blocking: false,
        message: "Assignment workload calculation used fallback duration.",
      },
    ];

    const html = renderToStaticMarkup(<AdminWarningList warnings={warnings} compact />);

    expect(html).toContain("medium");
    expect(html).toContain("Advisory");
    expect(html).toContain("admin.assignment.duration_fallback_used");
    expect(html).not.toContain("Fields:");
  });
});
