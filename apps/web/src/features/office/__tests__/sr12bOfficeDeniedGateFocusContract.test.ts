import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const shellPath = join(process.cwd(), "src/features/office/OfficeShell.tsx");
const source = readFileSync(shellPath, "utf8");

describe("SR-12B Office denied gate focus contract", () => {
  it("keeps all denied-gate actions keyboard-focus visible", () => {
    expect(source).toContain("Try again");
    expect(source).toContain("Use a different account");
    expect(source).toContain("Login as Admin");

    const deniedGateSource = source.slice(source.indexOf("function DeniedGate"), source.indexOf("export function OfficeShell"));
    expect(deniedGateSource.match(/focus-visible:ring-2/g)?.length).toBe(3);
    expect(deniedGateSource).toContain("focus-visible:ring-ring");
    expect(deniedGateSource).toContain("focus-visible:ring-emerald-600");
  });

  it("preserves denied-gate retry and login routing behavior", () => {
    expect(source).toContain("onClick={onRetry}");
    expect(source).toContain('href={`/login?redirect=${encodeURIComponent(redirectTarget)}`}');
  });

  it("preserves the SR-12A accessible first-paint loading contract", () => {
    expect(source).toContain('role="status"');
    expect(source).toContain('aria-live="polite"');
    expect(source).toContain('aria-busy="true"');
    expect(source).toContain("Loading Office workspace…");
  });
});
