import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(join(process.cwd(), "components/nav/HeaderLoginButton.tsx"), "utf8");

describe("booking header authentication control", () => {
  it("uses distinct signed-in and signed-out presentations", () => {
    expect(source).toContain("user ? <UserRound");
    expect(source).toContain(": <LogIn");
    expect(source).toContain('user ? "Account" : "Sign in"');
    expect(source).toContain("bg-emerald-500");
  });

  it("preserves the current booking URL when sending a guest to sign in", () => {
    expect(source).toContain('const loginHref = `/auth/login?redirect=${encodeURIComponent(redirectTarget)}`');
    expect(source).toContain("<Link href={loginHref}>");
    expect(source).toContain("<Link href={signupHref}>");
  });

  it("announces the authenticated email without rendering it visually", () => {
    expect(source).toContain("Signed in${user.email ? ` as ${user.email}`");
  });

  it("offers authenticated account actions and sign out", () => {
    expect(source).toContain('href="/account/bookings"');
    expect(source).toContain("void signOut().then");
    expect(source).toContain("<DropdownMenuTrigger asChild>");
  });
});
