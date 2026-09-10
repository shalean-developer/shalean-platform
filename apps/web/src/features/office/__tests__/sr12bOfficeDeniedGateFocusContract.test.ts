import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  join(process.cwd(), "src/features/office/OfficeShell.tsx"),
  "utf8",
);
const deniedGate = source.slice(
  source.indexOf("function DeniedGate"),
  source.indexOf("export function OfficeShell"),
);

describe("SR-12B Office denied-gate focus convergence", () => {
  it("keeps every denied-gate action visibly keyboard focused", () => {
    expect(deniedGate).toContain("Try again");
    expect(deniedGate).toContain("Use a different account");
    expect(deniedGate).toContain("Login as Admin");
    expect(deniedGate).toContain("const actionClass =");
    expect(deniedGate).toContain("focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2");
    expect(deniedGate.match(/className=\{actionClass\}/g)).toHaveLength(2);
    expect(deniedGate.match(/focus-visible:ring-2/g)).toHaveLength(2);
  });

  it("preserves retry and redirect behaviour", () => {
    expect(deniedGate).toContain("onClick={onRetry}");
    expect(deniedGate.match(/href=\{`\/login\?redirect=\$\{encodeURIComponent\(redirectTarget\)\}`\}/g)).toHaveLength(2);
  });

  it("preserves the SR-12A immediate loading announcement", () => {
    expect(source).toContain('role="status"');
    expect(source).toContain('aria-live="polite"');
    expect(source).toContain("Loading Office workspace…");
    expect(source).not.toContain('aria-busy="true"');
  });
});
