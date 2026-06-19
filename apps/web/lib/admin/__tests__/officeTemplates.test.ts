import { describe, expect, it } from "vitest";
import {
  aggregateOfficeTemplateUsage,
  buildOfficeTemplatesSummary,
  mapOfficeTemplateRow,
  resolveOfficeTemplateTrigger,
} from "@/lib/admin/officeTemplates";
import type { TemplateRow } from "@/lib/templates/types";

const baseRow = (overrides: Partial<TemplateRow> = {}): TemplateRow => ({
  id: "tpl-1",
  key: "booking_confirmed",
  channel: "email",
  subject: "Booking Confirmed",
  content: "<p>Hi {{customer_name}}</p>",
  variables: ["customer_name", "date"],
  is_active: true,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-05-02T00:00:00.000Z",
  ...overrides,
});

describe("resolveOfficeTemplateTrigger", () => {
  it("maps known keys", () => {
    expect(resolveOfficeTemplateTrigger("booking_confirmed")).toContain("confirmed");
    expect(resolveOfficeTemplateTrigger("unknown_key")).toBe("Automated notification");
  });
});

describe("aggregateOfficeTemplateUsage", () => {
  it("aggregates by template key and channel", () => {
    const map = aggregateOfficeTemplateUsage([
      { template_key: "booking_confirmed", channel: "email", status: "sent", created_at: "2026-06-01T10:00:00.000Z" },
      { template_key: "booking_confirmed", channel: "email", status: "failed", created_at: "2026-06-02T10:00:00.000Z" },
      { template_key: "booking_confirmed", channel: "sms", status: "sent", created_at: "2026-06-03T10:00:00.000Z" },
    ]);
    const email = map.get("booking_confirmed:email");
    expect(email?.sent).toBe(1);
    expect(email?.failed).toBe(1);
    expect(email?.lastSentAt).toBe("2026-06-02T10:00:00.000Z");
    expect(map.get("booking_confirmed:sms")?.sent).toBe(1);
  });
});

describe("buildOfficeTemplatesSummary", () => {
  it("builds channel stats and totals", () => {
    const summary = buildOfficeTemplatesSummary({
      fetchedAt: "2026-06-19T12:00:00.000Z",
      templateRows: [
        baseRow(),
        baseRow({ id: "tpl-2", channel: "sms", is_active: false }),
      ],
      usageRows: [
        { template_key: "booking_confirmed", channel: "email", status: "sent", created_at: "2026-06-01T10:00:00.000Z" },
      ],
    });
    expect(summary.templates).toHaveLength(2);
    expect(summary.totals.active).toBe(1);
    expect(summary.totals.sent30d).toBe(1);
    expect(summary.channels.find((c) => c.channel === "email")?.count).toBe(1);
  });
});

describe("mapOfficeTemplateRow", () => {
  it("maps db row with usage", () => {
    const item = mapOfficeTemplateRow(
      baseRow(),
      aggregateOfficeTemplateUsage([
        { template_key: "booking_confirmed", channel: "email", status: "sent", created_at: "2026-06-01T10:00:00.000Z" },
      ]),
    );
    expect(item.name).toBe("Booking confirmed");
    expect(item.variables).toEqual(["customer_name", "date"]);
    expect(item.usage.sent).toBe(1);
  });
});
