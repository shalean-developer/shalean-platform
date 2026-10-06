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


describe("MASTER-01A-04 missing-profile recovery path", () => {
  it("repairs missing profiles through an authenticated server route", () => {
    const route = read("apps/web/app/api/auth/complete-profile/route.ts");

    expect(route).toContain("pub.auth.getUser(token)");
    expect(route).toContain("ensureUserProfileForAuthUser(admin, userId)");
    expect(route).toContain("resolveUserRoleServer(admin");
    expect(route).toContain("dashboardRouteForRole(resolved.role)");
    expect(route).not.toContain('role: "customer"');
  });

  it("does not send existing authenticated users back through signup", () => {
    const page = read("apps/web/app/complete-profile/page.tsx");

    expect(page).toContain('fetch("/api/auth/complete-profile"');
    expect(page).toContain("window.location.replace(json.dashboardRoute)");
    expect(page).not.toContain('href="/auth/signup"');
    expect(page).not.toContain("Create account");
  });

  it("keeps missing-profile repair bound to the current authenticated access token", () => {
    const page = read("apps/web/app/complete-profile/page.tsx");
    const route = read("apps/web/app/api/auth/complete-profile/route.ts");

    expect(page).toContain("session.access_token");
    expect(route).toContain('access_token is required.');
    expect(route).toContain("Invalid or expired token.");
  });
});


describe("MASTER-01A-04 cleaner identity convergence", () => {
  it("uses the canonical cleaner resolver for profile-role inference", () => {
    const infer = read("apps/web/lib/admin/inferUserProfileRole.ts");
    const resolver = read("apps/web/lib/auth/resolveUserRoleServer.ts");

    expect(infer).toContain("fetchCleanerRowForSupabaseAuthUser");
    expect(resolver).toContain("fetchCleanerRowForSupabaseAuthUser");
    expect(infer).not.toContain('.eq("auth_user_id", userId).maybeSingle()');
  });

  it("keeps alternate cleaner auth links and legacy-id fallback in the shared resolver", () => {
    const cleaner = read("apps/web/lib/cleaner/resolveCleanerFromRequest.ts");

    expect(cleaner).toContain('.from("cleaner_auth_links")');
    expect(cleaner).toContain('.eq("is_active", true)');
    expect(cleaner).toContain('.eq("id", authUserId).maybeSingle()');
  });
});


describe("MASTER-01A-04 profile-repair redirect preservation", () => {
  it("carries only safe in-app redirects into complete-profile", () => {
    const resolver = read("apps/web/lib/auth/resolvePostAuthDestination.ts");

    expect(resolver).toContain('rawRedirect.startsWith("/")');
    expect(resolver).toContain('!rawRedirect.startsWith("//")');
    expect(resolver).toContain('!rawRedirect.includes("://")');
    expect(resolver).toContain('/complete-profile?redirect=');
  });

  it("applies role-safe redirect only after server-side profile repair and role resolution", () => {
    const route = read("apps/web/app/api/auth/complete-profile/route.ts");

    expect(route).toContain("ensureUserProfileForAuthUser(admin, userId)");
    expect(route).toContain("resolveUserRoleServer(admin");
    expect(route).toContain("safePostLoginRedirect(body.redirect, resolved.role)");
  });

  it("forwards the preserved redirect from complete-profile into the repair endpoint", () => {
    const page = read("apps/web/app/complete-profile/page.tsx");

    expect(page).toContain('searchParams.get("redirect")');
    expect(page).toContain("redirect,");
    expect(page).toContain("window.location.replace(json.dashboardRoute)");
  });
});


describe("MASTER-01A-04 redirect hardening and guarded deep-link repair", () => {
  it("rejects backslash-based post-login redirects", () => {
    const userRole = read("apps/web/lib/auth/userRole.ts");

    expect(userRole).toContain('t.includes("\\\\")');
  });

  it("carries pathname and query from role-guard missing-profile redirects", () => {
    const guard = read("apps/web/lib/auth/useRoleRouteGuard.tsx");

    expect(guard).not.toContain("useSearchParams");
    expect(guard).toContain("window.location.search");
    expect(guard).toContain("/complete-profile?redirect=");
    expect(guard).toContain("encodeURIComponent(requested)");
  });

  it("keeps role-safe redirect application server-side after repair", () => {
    const route = read("apps/web/app/api/auth/complete-profile/route.ts");

    expect(route).toContain("safePostLoginRedirect(body.redirect, resolved.role)");
  });
});


describe("MASTER-01A-04 redirect control-character hardening", () => {
  it("rejects browser-stripped control characters in post-login redirects", () => {
    const userRole = read("apps/web/lib/auth/userRole.ts");

    expect(userRole).toContain("/[\\u0000-\\u001f\\u007f]/.test(t)");
  });
});


describe("MASTER-01A-04A complete-profile session lookup", () => {
  it("uses the guarded shared Supabase session helper instead of direct auth.getSession", () => {
    const page = read("apps/web/app/complete-profile/page.tsx");

    expect(page).toContain("getSupabaseSession");
    expect(page).not.toContain("sb.auth.getSession()");
  });
});


describe("MASTER-01A-04A complete-profile session failure handling", () => {
  it("uses the guarded session helper instead of direct auth.getSession", () => {
    const page = read("apps/web/app/complete-profile/page.tsx");
    const browser = read("apps/web/lib/supabase/browser.ts");

    expect(page).toContain("getSupabaseSession");
    expect(page).not.toContain("sb.auth.getSession()");
    expect(browser).toContain("export async function getSupabaseSession()");
    expect(browser).toContain("catch {");
    expect(browser).toContain("return null;");
  });

  it("fails closed to login when the guarded session helper yields no session", () => {
    const page = read("apps/web/app/complete-profile/page.tsx");

    expect(page).toContain('if (!session?.access_token)');
    expect(page).toContain('window.location.replace("/auth/login")');
  });
});


describe("MASTER-01A-04B complete-profile repair timeout", () => {
  it("bounds the profile-repair request with AbortController", () => {
    const page = read("apps/web/app/complete-profile/page.tsx");

    expect(page).toContain("PROFILE_REPAIR_TIMEOUT_MS = 8_000");
    expect(page).toContain("new AbortController()");
    expect(page).toContain("controller.abort()");
    expect(page).toContain("signal: controller.signal");
    expect(page).toContain("window.clearTimeout(timer)");
  });

  it("routes repair timeout into the recoverable error state", () => {
    const page = read("apps/web/app/complete-profile/page.tsx");

    expect(page).toContain('e instanceof DOMException && e.name === "AbortError"');
    expect(page).toContain("Profile repair timed out. Check your connection and try again.");
    expect(page).toContain("setRepairing(false)");
  });
});


describe("MASTER-01A-04C complete-profile session timeout", () => {
  it("bounds the profile session lookup before repair starts", () => {
    const page = read("apps/web/app/complete-profile/page.tsx");

    expect(page).toContain("PROFILE_SESSION_TIMEOUT_MS = 8_000");
    expect(page).toContain("getBoundedProfileSession()");
    expect(page).toContain("Promise.race");
    expect(page).toContain("getSupabaseSession()");
    expect(page).toContain("window.setTimeout");
    expect(page).toContain("window.clearTimeout(timer)");
  });

  it("fails closed to login when the bounded session lookup times out", () => {
    const page = read("apps/web/app/complete-profile/page.tsx");

    expect(page).toContain("const session = await getBoundedProfileSession()");
    expect(page).toContain('if (!session?.access_token)');
    expect(page).toContain('window.location.replace("/auth/login")');
  });
});


describe("MASTER-01A-05 logout/session invalidation source of truth", () => {
  it("confirms Supabase sign-out before clearing local auth state", () => {
    const authClient = read("apps/web/lib/auth/authClient.ts");
    const start = authClient.indexOf("export async function signOut");
    const end = authClient.indexOf("export type MfaStatus", start);
    const signOutSource = authClient.slice(start, end);

    const remoteIdx = signOutSource.indexOf("await sb.auth.signOut()");
    const errorIdx = signOutSource.indexOf("if (error) throw");
    const sessionCacheIdx = signOutSource.indexOf("clearSupabaseSessionCache()");
    const intentIdx = signOutSource.indexOf("clearAuthIntent()");
    const roleIdx = signOutSource.indexOf("clearCachedUserRole()");
    const cleanerIdx = signOutSource.indexOf('localStorage.removeItem("cleaner_id")');

    expect(remoteIdx).toBeGreaterThanOrEqual(0);
    expect(errorIdx).toBeGreaterThan(remoteIdx);
    expect(sessionCacheIdx).toBeGreaterThan(errorIdx);
    expect(intentIdx).toBeGreaterThan(errorIdx);
    expect(roleIdx).toBeGreaterThan(errorIdx);
    expect(cleanerIdx).toBeGreaterThan(errorIdx);
  });

  it("fails closed when browser auth is unavailable or Supabase sign-out fails", () => {
    const authClient = read("apps/web/lib/auth/authClient.ts");
    const start = authClient.indexOf("export async function signOut");
    const end = authClient.indexOf("export type MfaStatus", start);
    const signOutSource = authClient.slice(start, end);

    expect(signOutSource).toContain('throw new Error("Supabase is not configured.")');
    expect(signOutSource).toContain("if (error) throw new Error(error.message)");
    expect(signOutSource).not.toContain("return { error:");
  });

  it("does not clear cleaner identity in callers before shared sign-out succeeds", () => {
    for (const path of [
      "apps/web/app/cleaner/profile/page.tsx",
      "apps/web/app/(ui-redesign)/jobs/profile/page.tsx",
      "apps/web/components/nav/SiteTopBarAccount.tsx",
    ]) {
      const source = read(path);
      const signOutIdx = source.indexOf("signOut()");
      const cleanerClearIdx = source.indexOf('removeItem("cleaner_id")');

      expect(signOutIdx).toBeGreaterThanOrEqual(0);
      expect(cleanerClearIdx === -1 || cleanerClearIdx > signOutIdx).toBe(true);
    }
  });
});
