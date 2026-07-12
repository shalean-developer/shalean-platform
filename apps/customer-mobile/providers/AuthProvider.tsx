import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { ResolveProfileResponse } from "@shalean/api-client";
import { normalizeEmail } from "@shalean/utils";
import { resetCustomerApiClient } from "@/lib/api/createCustomerApiClient";
import { signInWithPassword, signUpWithPassword } from "@/lib/auth/customerAuth";
import {
  clearSessionTokens,
  getAccessToken,
  refreshAccessToken,
  setSessionTokens,
} from "@/lib/auth/secureStoreTokenProvider";
import { friendlyErrorMessage } from "@/lib/errors/apiErrorMessage";
import { getAuthApi } from "@/services/customerApi";

export type AuthStatus = "loading" | "signedOut" | "signedIn";

export type CustomerAuthProfile = {
  userId: string;
  email: string | null;
  role: "customer";
  fullName?: string | null;
};

type AuthContextValue = {
  status: AuthStatus;
  profile: CustomerAuthProfile | null;
  signIn: (
    email: string,
    password: string,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  signUp: (input: {
    email: string;
    password: string;
    fullName: string;
    phone?: string;
  }) => Promise<
    { ok: true; needsEmailConfirmation?: boolean } | { ok: false; error: string }
  >;
  requestPasswordReset: (
    email: string,
  ) => Promise<{ ok: true } | { ok: false; error: string; noAccount?: boolean }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

type ResolveResult =
  | { kind: "ok"; data: ResolveProfileResponse; email: string | null }
  | { kind: "unauthorized" }
  | { kind: "wrong_role"; role: string }
  | { kind: "missing_profile" }
  | { kind: "transient"; error: string; status: number };

function claimsFromAccessToken(accessToken: string): { email: string | null; userId: string | null } {
  try {
    const payload = accessToken.split(".")[1];
    if (!payload) return { email: null, userId: null };
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const pad = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
    const json = JSON.parse(
      typeof atob === "function"
        ? atob(pad)
        : Buffer.from(pad, "base64").toString("utf8"),
    ) as { email?: unknown; sub?: unknown };
    return {
      email: typeof json.email === "string" && json.email.trim() ? json.email.trim() : null,
      userId: typeof json.sub === "string" && json.sub.trim() ? json.sub.trim() : null,
    };
  } catch {
    return { email: null, userId: null };
  }
}

function emailFromAccessToken(accessToken: string): string | null {
  return claimsFromAccessToken(accessToken).email;
}

async function resolveCustomerProfile(accessToken: string): Promise<ResolveResult> {
  let token = accessToken;
  let result = await getAuthApi().resolveProfile(token);
  if (!result.ok && result.status === 401) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      resetCustomerApiClient();
      token = refreshed;
      result = await getAuthApi().resolveProfile(refreshed);
    }
  }

  if (!result.ok) {
    if (result.status === 404) {
      return { kind: "missing_profile" };
    }
    if (result.status === 401 || result.status === 403) {
      const body = result.body as
        | { invalidRole?: boolean; missingProfile?: boolean; role?: string }
        | undefined;
      if (body?.missingProfile) {
        return { kind: "missing_profile" };
      }
      if (body?.invalidRole) {
        return { kind: "wrong_role", role: String(body.role ?? "unknown") };
      }
      // 403 without flags — still inspect body error text from API client
      const errText = `${result.error ?? ""}`.toLowerCase();
      if (errText.includes("invalid") && errText.includes("role")) {
        return { kind: "wrong_role", role: "invalid" };
      }
      if (errText.includes("profile")) {
        return { kind: "missing_profile" };
      }
      return { kind: "unauthorized" };
    }
    return { kind: "transient", error: result.error, status: result.status };
  }

  const data = result.data as Record<string, unknown> | null;
  if (!data || typeof data !== "object") {
    return { kind: "unauthorized" };
  }

  // Success payloads include ok:true; also accept userId+role if ok is omitted.
  const role = typeof data.role === "string" ? data.role : null;
  const userId = typeof data.userId === "string" ? data.userId : null;
  const flaggedOk = data.ok === true || data.ok === undefined;

  if (data.ok === false) {
    if (data.missingProfile) return { kind: "missing_profile" };
    if (data.invalidRole) return { kind: "wrong_role", role: "invalid" };
    return { kind: "unauthorized" };
  }

  if (!flaggedOk || !userId || !role) {
    return { kind: "unauthorized" };
  }

  if (role !== "customer") {
    return { kind: "wrong_role", role };
  }

  const emailFromApi =
    typeof data.email === "string" && data.email.trim() ? data.email.trim() : null;
  const email = emailFromApi || emailFromAccessToken(token);

  return {
    kind: "ok",
    data: {
      ok: true,
      userId,
      role: "customer",
      dashboardRoute:
        typeof data.dashboardRoute === "string" ? data.dashboardRoute : "/account",
      email,
    },
    email,
  };
}

function wrongRoleMessage(role: string): string {
  if (role === "cleaner") {
    return "This account is for cleaners. Please use the Shalean Cleaner app.";
  }
  if (role === "admin") {
    return "Admin accounts use the Shalean website office portal.";
  }
  return "This app is only available for customer accounts.";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [profile, setProfile] = useState<CustomerAuthProfile | null>(null);

  const restore = useCallback(async () => {
    if (__DEV__) {
      console.info("[startup] AuthProvider.restore begin");
    }
    const token = (await getAccessToken())?.trim();
    if (!token) {
      setProfile(null);
      setStatus("signedOut");
      if (__DEV__) {
        console.info("[startup] AuthProvider.restore → signedOut (no token)");
      }
      return;
    }

    try {
      const resolved = await resolveCustomerProfile(token);
      if (resolved.kind === "ok") {
        setProfile({
          userId: resolved.data.userId,
          email: resolved.email,
          role: "customer",
        });
        setStatus("signedIn");
        if (__DEV__) {
          console.info("[startup] AuthProvider.restore → signedIn");
        }
        return;
      }
      if (resolved.kind === "transient") {
        const claims = claimsFromAccessToken(token);
        setProfile(
          claims.userId
            ? { userId: claims.userId, email: claims.email, role: "customer" }
            : null,
        );
        setStatus("signedIn");
        if (__DEV__) {
          console.info("[startup] AuthProvider.restore → signedIn (transient)");
        }
        return;
      }
      await clearSessionTokens();
      resetCustomerApiClient();
      setProfile(null);
      setStatus("signedOut");
      if (__DEV__) {
        console.info("[startup] AuthProvider.restore → signedOut (", resolved.kind, ")");
      }
    } catch (e) {
      setProfile(null);
      setStatus("signedOut");
      if (__DEV__) {
        console.warn(
          "[startup] AuthProvider.restore failed → signedOut",
          e instanceof Error ? e.message : e,
        );
      }
    }
  }, []);

  useEffect(() => {
    void restore();
  }, [restore]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const auth = await signInWithPassword(normalizeEmail(email), password);
      if (!auth.ok) {
        return { ok: false as const, error: friendlyErrorMessage(auth.error, "Sign in failed.") };
      }

      await setSessionTokens(auth.session);
      resetCustomerApiClient();

      let resolved = await resolveCustomerProfile(auth.session.access_token);

      // Profile row can lag right after first auth — retry once after ensure path in signInWithPassword.
      if (resolved.kind === "missing_profile" || resolved.kind === "unauthorized") {
        await new Promise((r) => setTimeout(r, 400));
        resolved = await resolveCustomerProfile(auth.session.access_token);
      }

      if (resolved.kind === "wrong_role") {
        await clearSessionTokens();
        resetCustomerApiClient();
        return { ok: false as const, error: wrongRoleMessage(resolved.role) };
      }

      if (resolved.kind === "ok") {
        setProfile({
          userId: resolved.data.userId,
          email: auth.email,
          role: "customer",
        });
        setStatus("signedIn");
        await queryClient.invalidateQueries();
        return { ok: true as const };
      }

      // Soft-fail: we have a valid Supabase session and ensured a customer profile seed.
      if (resolved.kind === "missing_profile" || resolved.kind === "transient" || resolved.kind === "unauthorized") {
        setProfile({
          userId: auth.userId,
          email: auth.email,
          role: "customer",
        });
        setStatus("signedIn");
        await queryClient.invalidateQueries();
        return { ok: true as const };
      }

      await clearSessionTokens();
      resetCustomerApiClient();
      return { ok: false as const, error: "Sign in failed. Please try again." };
    },
    [queryClient],
  );

  const signUp = useCallback(
    async (input: { email: string; password: string; fullName: string; phone?: string }) => {
      const auth = await signUpWithPassword({
        ...input,
        email: normalizeEmail(input.email),
      });
      if (!auth.ok) {
        return { ok: false as const, error: friendlyErrorMessage(auth.error, "Could not create account.") };
      }

      if (auth.needsEmailConfirmation || !auth.session) {
        return {
          ok: true as const,
          needsEmailConfirmation: true,
        };
      }

      await setSessionTokens(auth.session);
      resetCustomerApiClient();

      let resolved = await resolveCustomerProfile(auth.session.access_token);
      if (resolved.kind === "missing_profile" || resolved.kind === "unauthorized" || resolved.kind === "transient") {
        await new Promise((r) => setTimeout(r, 400));
        resolved = await resolveCustomerProfile(auth.session.access_token);
      }

      if (resolved.kind === "wrong_role") {
        await clearSessionTokens();
        resetCustomerApiClient();
        return { ok: false as const, error: wrongRoleMessage(resolved.role) };
      }

      // New customer signup with a live session: always enter the app.
      // resolve-profile can 401/404 briefly before the profile row is visible.
      setProfile({
        userId: resolved.kind === "ok" ? resolved.data.userId : auth.userId,
        email: auth.email,
        role: "customer",
        fullName: input.fullName,
      });
      setStatus("signedIn");
      await queryClient.invalidateQueries();
      return { ok: true as const };
    },
    [queryClient],
  );

  const requestPasswordReset = useCallback(async (email: string) => {
    const result = await getAuthApi().forgotPassword(normalizeEmail(email));
    if (!result.ok) {
      return {
        ok: false as const,
        error: friendlyErrorMessage(result.error, "Could not send reset email. Try again."),
      };
    }
    const body = result.data;
    if (body?.code === "no_account") {
      return {
        ok: false as const,
        error: "We could not find an account with that email.",
        noAccount: true,
      };
    }
    if (body?.sent) {
      return { ok: true as const };
    }
    if (body?.error) {
      return { ok: false as const, error: body.error };
    }
    return { ok: false as const, error: "Could not send reset email. Try again." };
  }, []);

  const signOut = useCallback(async () => {
    await clearSessionTokens();
    resetCustomerApiClient();
    queryClient.clear();
    setProfile(null);
    setStatus("signedOut");
  }, [queryClient]);

  const refreshProfile = useCallback(async () => {
    const token = (await getAccessToken())?.trim();
    if (!token) {
      await signOut();
      return;
    }
    const resolved = await resolveCustomerProfile(token);
    if (resolved.kind === "ok") {
      setProfile((prev) => ({
        userId: resolved.data.userId,
        email: prev?.email ?? null,
        role: "customer",
        fullName: prev?.fullName,
      }));
      setStatus("signedIn");
      return;
    }
    if (resolved.kind === "transient") return;
    await signOut();
  }, [signOut]);

  const value = useMemo(
    () => ({
      status,
      profile,
      signIn,
      signUp,
      requestPasswordReset,
      signOut,
      refreshProfile,
    }),
    [status, profile, signIn, signUp, requestPasswordReset, signOut, refreshProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
