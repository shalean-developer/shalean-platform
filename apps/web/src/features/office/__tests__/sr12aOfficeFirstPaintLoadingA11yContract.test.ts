import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  join(process.cwd(), "src/features/office/OfficeShell.tsx"),
  "utf8",
);

describe("SR-12A Office first-paint loading accessibility contract", () => {
  it("announces the Office loading state without exposing decorative skeleton blocks", () => {
    expect(source).toContain('role="status"');
    expect(source).toContain('aria-live="polite"');
    expect(source).toContain('aria-busy="true"');
    expect(source).toContain('Loading Office workspace…');
    expect(source).toContain('aria-hidden="true" className="h-16 animate-pulse');
    expect(source).toContain('aria-hidden="true" className="flex flex-1"');
  });

  it("keeps both checking and timeout states on the shared OfficeSkeleton", () => {
    expect(source).toContain('if (roleState.status === "checking")');
    expect(source).toContain('return <OfficeSkeleton />;');
    expect(source).toContain('if (roleState.status === "timeout")');
    expect(source).toContain('<RoleGuardRetryBanner onRetry={retry} />');
    expect(source.match(/<OfficeSkeleton \/>/g)?.length).toBeGreaterThanOrEqual(2);
  });
});
