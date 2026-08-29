import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(__dirname, "../../../../..");
const selectSource = readFileSync(resolve(root, "components/admin/office/OfficeZohoSelect.tsx"), "utf8");
const pageSource = readFileSync(resolve(root, "app/(ui-redesign)/office/cleaner-performance/page.tsx"), "utf8");

describe("SR-11I shared Office select contract", () => {
  it("provides the shared select styling and focus/disabled states", () => {
    expect(selectSource).toContain("export function OfficeZohoSelect");
    expect(selectSource).toContain("focus:ring-2");
    expect(selectSource).toContain("disabled:cursor-not-allowed");
    expect(selectSource).toContain("SelectHTMLAttributes<HTMLSelectElement>");
  });

  it("keeps Cleaner Performance period behavior while using the shared select", () => {
    expect(pageSource).toContain('OfficeZohoSelect');
    expect(pageSource).toContain('aria-label="Scorecard period"');
    expect(pageSource).toContain('<option value={30}>30 days</option>');
    expect(pageSource).toContain('<option value={90}>90 days</option>');
    expect(pageSource).toContain('<option value={180}>180 days</option>');
    expect(pageSource).toContain('<option value={365}>365 days</option>');
    expect(pageSource).toContain('onChange={(e) => setDays(Number(e.target.value))}');
    expect(pageSource).toContain('/api/admin/cleaner-performance?days=${days}');
  });
});
