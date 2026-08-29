import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "../../../../..");
const badgePath = path.join(repoRoot, "components/admin/office/OfficeZohoStatusBadge.tsx");
const pagePath = path.join(repoRoot, "app/(ui-redesign)/office/cleaner-performance/page.tsx");

const badgeSource = fs.readFileSync(badgePath, "utf8");
const pageSource = fs.readFileSync(pagePath, "utf8");

describe("SR-11K shared Office status badge contract", () => {
  it("defines the shared status badge tones", () => {
    expect(badgeSource).toContain('export type OfficeZohoStatusTone = "positive" | "info" | "warn" | "danger" | "neutral"');
    expect(badgeSource).toContain('positive: "bg-emerald-50 text-emerald-700"');
    expect(badgeSource).toContain('info: "bg-blue-50 text-blue-700"');
    expect(badgeSource).toContain('warn: "bg-amber-50 text-amber-700"');
    expect(badgeSource).toContain('danger: "bg-red-50 text-red-700"');
    expect(badgeSource).toContain('neutral: "bg-slate-100 text-slate-600"');
  });

  it("adopts the shared badge on cleaner performance without changing grade semantics", () => {
    expect(pageSource).toContain("OfficeZohoStatusBadge");
    expect(pageSource).toContain('if (grade === "A") return "positive"');
    expect(pageSource).toContain('if (grade === "B") return "info"');
    expect(pageSource).toContain('if (grade === "C") return "warn"');
    expect(pageSource).toContain('if (grade === "D") return "danger"');
    expect(pageSource).toContain('return "neutral"');
    expect(pageSource).toContain("<OfficeZohoStatusBadge tone={gradeTone(r.grade)}>{r.grade}</OfficeZohoStatusBadge>");
  });

  it("preserves the cleaner-performance data contract and shared controls", () => {
    expect(pageSource).toContain("/api/admin/cleaner-performance?days=${days}");
    expect(pageSource).toContain("OfficeZohoSelect");
    expect(pageSource).toContain("OfficeZohoTableShell");
    expect(pageSource).toContain("OfficeZohoSecondaryButton");
    expect(pageSource).toContain('grade: "A" | "B" | "C" | "D" | "Needs evidence"');
  });
});
