import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(process.cwd(), "../..");

function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

describe("MASTER-01A-02 auth/session source of truth", () => {
  it("retires the unreferenced guest magic-link sender and callback surface", () => {
    for (const relativePath of [
      "apps/web/app/api/auth/create-from-guest/route.ts",
      "apps/web/app/auth/callback/page.tsx",
      "apps/web/lib/auth/bootstrapAuthCallbackSession.ts",
      "apps/web/lib/auth/__tests__/master01aAuthCallbackPkce.test.ts",
    ]) {
      expect(existsSync(resolve(root, relativePath))).toBe(false);
    }
  });

  it("keeps Booking V2 authentication on the password sign-in/sign-up source of truth", () => {
    const step4 = read("apps/web/src/features/booking-v2/steps/Step4Payment.tsx");
    expect(step4).toMatch(
      /import\s*\{[^}]*signIn[^}]*signUp[^}]*\}\s*from\s*"@\/lib\/auth\/authClient"/,
    );
    expect(step4).toContain("await signIn(data.email, data.password)");
    expect(step4).toContain(
      "await signUp(data.email, data.password, data.fullName, data.phone ?? \"\")",
    );
    expect(step4).not.toContain("/api/auth/create-from-guest");
    expect(step4).not.toContain("/auth/callback");
  });

  it("links guest bookings after authenticated password flows through one canonical client helper", () => {
    const authClient = read("apps/web/lib/auth/authClient.ts");
    const linker = read("apps/web/lib/booking/clientLinkBookings.ts");

    expect(authClient.match(/linkBookingsToUserAfterAuth\(/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(linker).toContain('fetch("/api/bookings/link-user"');
    expect(linker).not.toContain("/api/auth/create-from-guest");
    expect(linker).not.toContain("/auth/callback");
  });

  it("retains dashboard ownership repair as an authenticated repair path, not an auth-entry path", () => {
    const bookingsHook = read("apps/web/hooks/useBookings.ts");
    expect(bookingsHook).toContain('"/api/auth/link-guest-bookings"');
    expect(bookingsHook).not.toContain("/api/auth/create-from-guest");
    expect(bookingsHook).not.toContain("/auth/callback");
  });
});


describe("MASTER-01A-04 sign-in role/profile source of truth", () => {
  it("does not create or assign user_profiles roles from the browser sign-in path", () => {
    const authClient = read("apps/web/lib/auth/authClient.ts");
    const signInStart = authClient.indexOf("export async function signIn");
    const signUpStart = authClient.indexOf("export async function signUp");
    const signInSource = authClient.slice(signInStart, signUpStart);

    expect(signInSource).not.toContain('.from("user_profiles")');
    expect(signInSource).not.toContain('role: "customer"');
    expect(signInSource).not.toContain(".insert(");
    expect(signInSource).not.toContain(".upsert(");
  });

  it("keeps new-customer profile creation in signup, not signin", () => {
    const authClient = read("apps/web/lib/auth/authClient.ts");
    const signUpStart = authClient.indexOf("export async function signUp");
    const signOutStart = authClient.indexOf("export async function signOut");
    const signUpSource = authClient.slice(signUpStart, signOutStart);

    expect(signUpSource).toContain('.from("user_profiles").upsert(');
    expect(signUpSource).toContain('role: "customer"');
  });

  it("keeps post-login role resolution on the server-authoritative resolve-profile route", () => {
    const login = read("apps/web/app/auth/login/LoginForm.tsx");
    const resolver = read("apps/web/app/api/auth/resolve-profile/route.ts");

    expect(login).toContain("resolvePostAuthDestination(session.access_token, redirect)");
    expect(resolver).toContain("resolveUserRoleServer(admin");
    expect(resolver).toContain("missingProfile: true");
    expect(resolver).toContain("invalidRole: true");
  });
});
