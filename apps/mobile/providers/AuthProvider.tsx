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
import { resetMobileApiClient } from "@/lib/api/createMobileApiClient";
import {
  clearSessionTokens,
  getAccessToken,
  refreshAccessToken,
  setSessionTokens,
} from "@/lib/auth/secureStoreTokenProvider";
import { diagnosticLog } from "@/lib/diagnostics/logger";
import { friendlyErrorMessage } from "@/lib/errors/apiErrorMessage";
import { CleanerApi } from "@/services/cleanerApi";
import type { CleanerMeResponse } from "@/services/types/cleanerJobs";

export type AuthStatus = "loading" | "signedOut" | "signedIn";

type AuthContextValue = {
  status: AuthStatus;
  profile: CleanerMeResponse | null;
  signIn: (phone: string, password: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

type ProfileLoadResult =
  | { kind: "ok"; data: CleanerMeResponse }
  | { kind: "unauthorized" }
  | { kind: "not_cleaner" }
  | { kind: "transient"; status: number; error: string };

async function loadCleanerProfile(): Promise<ProfileLoadResult> {
  let me = await CleanerApi.me();
  if (!me.ok && me.status === 401) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      resetMobileApiClient();
      me = await CleanerApi.me();
    }
  }

  if (!me.ok) {
    if (me.status === 401 || me.status === 403) {
      return { kind: "unauthorized" };
    }
    // Network / 5xx / timeout — keep tokens so offline / flaky restore can continue.
    return { kind: "transient", status: me.status, error: me.error };
  }

  if (!me.data.isCleaner || !me.data.cleaner) {
    return { kind: "not_cleaner" };
  }

  return { kind: "ok", data: me.data };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [profile, setProfile] = useState<CleanerMeResponse | null>(null);

  const restore = useCallback(async () => {
    const token = (await getAccessToken())?.trim();
    if (!token) {
      setProfile(null);
      setStatus("signedOut");
      return;
    }

    try {
      const result = await loadCleanerProfile();

      if (result.kind === "ok") {
        setProfile(result.data);
        setStatus("signedIn");
        diagnosticLog.info("Session restored", { cleanerId: result.data.cleaner?.id });
        return;
      }

      if (result.kind === "transient") {
        // Stay signed in with tokens; profile may hydrate from cache / later sync.
        setProfile(null);
        setStatus("signedIn");
        diagnosticLog.warn("Session restore deferred (transient API failure)", {
          status: result.status,
          error: result.error,
        });
        return;
      }

      await clearSessionTokens();
      resetMobileApiClient();
      setProfile(null);
      setStatus("signedOut");
      diagnosticLog.warn("Session restore failed; signed out", { reason: result.kind });
    } catch (e) {
      // Unexpected throw — keep tokens, allow cached offline use.
      setProfile(null);
      setStatus("signedIn");
      diagnosticLog.error("Session restore error; keeping tokens", {
        error: friendlyErrorMessage(e),
      });
    }
  }, []);

  useEffect(() => {
    void restore();
  }, [restore]);

  const signIn = useCallback(
    async (phone: string, password: string) => {
      const result = await CleanerApi.login(phone, password);
      if (!result.ok) {
        return { ok: false as const, error: friendlyErrorMessage(result.error, "Sign in failed.") };
      }
      const session = result.data.session;
      if (!session?.access_token || !session?.refresh_token) {
        return { ok: false as const, error: "Login succeeded but the session was incomplete." };
      }

      await setSessionTokens({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      });
      resetMobileApiClient();

      const profileResult = await loadCleanerProfile();
      if (profileResult.kind !== "ok") {
        await clearSessionTokens();
        resetMobileApiClient();
        if (profileResult.kind === "transient") {
          return { ok: false as const, error: friendlyErrorMessage(profileResult.error, "Could not verify cleaner profile.") };
        }
        return { ok: false as const, error: "This account is not a cleaner." };
      }

      setProfile(profileResult.data);
      setStatus("signedIn");
      await queryClient.invalidateQueries();
      diagnosticLog.info("Signed in", { cleanerId: profileResult.data.cleaner?.id });
      return { ok: true as const };
    },
    [queryClient],
  );

  const signOut = useCallback(async () => {
    await clearSessionTokens();
    resetMobileApiClient();
    queryClient.clear();
    setProfile(null);
    setStatus("signedOut");
    diagnosticLog.info("Signed out");
  }, [queryClient]);

  const refreshProfile = useCallback(async () => {
    const result = await loadCleanerProfile();
    if (result.kind === "ok") {
      setProfile(result.data);
      setStatus("signedIn");
      return;
    }
    if (result.kind === "transient") {
      diagnosticLog.warn("Profile refresh skipped (transient)", { status: result.status });
      return;
    }
    await signOut();
  }, [signOut]);

  const value = useMemo(
    () => ({ status, profile, signIn, signOut, refreshProfile }),
    [status, profile, signIn, signOut, refreshProfile],
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
