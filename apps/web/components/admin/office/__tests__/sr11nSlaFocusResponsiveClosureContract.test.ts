import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const pagePath = path.join(
  process.cwd(),
  "app/(ui-redesign)/office/sla-breaches/page.tsx",
);

const source = fs.readFileSync(pagePath, "utf8");

describe("SR-11N SLA focus/responsive closure contract", () => {
  it("keeps the SLA data and behavior contract unchanged", () => {
    expect(source).toContain('useAdminData<BookingsResponse>("/api/admin/bookings"');
    expect(source).toContain('params: { filter: "sla" }');
    expect(source).toContain('onClick={() => void refetch()}');
    expect(source).toContain('setSevFilter(s)');
    expect(source).toContain('href={`/office/bookings/${b.id}`}');
  });

  it("uses a narrow-screen-safe KPI grid", () => {
    expect(source).toContain('className="grid gap-3 sm:grid-cols-3"');
    expect(source).not.toContain('className="grid grid-cols-3 gap-3"');
  });

  it("provides visible focus treatment for local interactive controls", () => {
    expect(source).toContain('focus-visible:ring-red-500');
    expect(source).toContain('focus-visible:ring-blue-500');
    expect(source).toContain('focus-visible:ring-offset-2');

    expect(source).toMatch(/Assign all unassigned[\s\S]*?focus-visible:ring-red-500|focus-visible:ring-red-500[\s\S]*?Assign all unassigned/);
    expect(source).toMatch(/Retry[\s\S]*?focus-visible:ring-red-500|focus-visible:ring-red-500[\s\S]*?Retry/);
    expect(source).toMatch(/Search breaches…[\s\S]*?focus-visible:ring-blue-500|focus-visible:ring-blue-500[\s\S]*?Search breaches…/);
    expect(source).toMatch(/setSevFilter\(s\)[\s\S]*?focus-visible:ring-blue-500|focus-visible:ring-blue-500[\s\S]*?setSevFilter\(s\)/);
    expect(source).toMatch(/Assign now[\s\S]*?focus-visible:ring-blue-500|focus-visible:ring-blue-500[\s\S]*?Assign now/);
  });
});
