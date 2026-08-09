import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(process.cwd(), "../..");
const read = (p: string) => fs.readFileSync(path.join(repoRoot, p), "utf8");

const selfRoute = read("apps/web/app/api/cleaner/training-compliance/route.ts");
const mobileTraining = read("apps/mobile/app/(cleaner)/training.tsx");
const officeTraining = read("apps/web/app/(ui-redesign)/office/workforce/training/page.tsx");
const cleanerManagement = read("apps/web/app/(ui-redesign)/office/cleaners/page.tsx");

describe("P6 training/compliance visibility", () => {
  it("keeps cleaner training self-only and backed by canonical ledgers", () => {
    expect(selfRoute).toContain("resolveCleanerIdFromRequest");
    expect(selfRoute).toContain("cleaner_training_assignments");
    expect(selfRoute).toContain("cleaner_compliance_records");
    expect(selfRoute).not.toContain("searchParams.get(\"cleaner_id\")");
  });

  it("shows canonical readiness in the cleaner app instead of static-only tips", () => {
    expect(mobileTraining).toContain("useCleanerTrainingCompliance");
    expect(mobileTraining).toContain("Assigned training");
    expect(mobileTraining).toContain("Compliance");
    expect(mobileTraining).toContain("Training tips");
  });

  it("exposes workforce readiness to Office cleaner management", () => {
    expect(officeTraining).toContain("/api/admin/workforce/training-compliance");
    expect(cleanerManagement).toContain("/office/workforce/training");
    expect(cleanerManagement).toContain("/office/cleaner-performance");
  });
});
