import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(
  path.resolve(process.cwd(), "app/(ui-redesign)/office/launch-check/page.tsx"),
  "utf8",
);

describe("SR-11D Office launch readiness shared chrome contract", () => {
  it("uses the shared Office page header and secondary action button", () => {
    expect(source).toContain("OfficeZohoPageHeader");
    expect(source).toContain("OfficeZohoSecondaryButton");
    expect(source).toContain('title="Launch readiness"');
  });

  it("does not rebuild the previous local launch readiness h1", () => {
    expect(source).not.toContain('<h1 className="text-2xl font-bold text-slate-900">Launch readiness</h1>');
  });

  it("preserves run-check and configuration gating behavior", () => {
    expect(source).toContain('adminFetch<LaunchCheckRunResponse>("/api/admin/launch-check", { method: "POST" })');
    expect(source).toContain('useAdminData<OfficeLaunchCheckStatus>("/api/admin/launch-check")');
    expect(source).toContain('status?.configReady === false');
    expect(source).toContain('onClick={() => void runChecks()}');
    expect(source).toContain('void refetch()');
  });
});
