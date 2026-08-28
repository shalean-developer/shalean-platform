import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(process.cwd(), "../..");
const read = (p: string) => fs.readFileSync(path.join(repoRoot, p), "utf8");

const selfRoute = read("apps/web/app/api/cleaner/training-compliance/route.ts");
const mobileTraining = read("apps/mobile/app/(cleaner)/training.tsx");
const mobileTypes = read("apps/mobile/services/types/cleanerTrainingCompliance.ts");
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

  it("carries missing compliance evidence through the cleaner-facing contract", () => {
    expect(selfRoute).toContain("missingComplianceEvidence: cleaner.missingComplianceEvidence");
    expect(mobileTypes).toContain("missingComplianceEvidence: boolean");
    expect(mobileTraining).toContain("cleaner?.missingComplianceEvidence");
    expect(mobileTraining).toContain("readiness cannot be confirmed");
  });

  it("exposes workforce readiness to Office cleaner management", () => {
    expect(officeTraining).toContain("/api/admin/workforce/training-compliance");
    expect(cleanerManagement).toContain("/office/workforce/training");
    expect(cleanerManagement).toContain("/office/cleaner-performance");
  });

  it("explains missing compliance evidence in the Office readiness table", () => {
    expect(officeTraining).toContain("missingComplianceEvidence: boolean");
    expect(officeTraining).toContain("row.missingComplianceEvidence");
    expect(officeTraining).toContain('"No evidence"');
    expect(officeTraining).toContain('"Current"');
  });
});
