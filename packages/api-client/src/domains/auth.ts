import type { ApiClient, ApiResult } from "../types";

export type ResolveProfileResponse = {
  ok: true;
  userId: string;
  role: "admin" | "cleaner" | "customer";
  dashboardRoute: string;
  /** Signup / auth email when available. */
  email?: string | null;
  isCleaner?: boolean;
};

export type ResolveProfileFailureBody = {
  ok: false;
  error?: string;
  missingProfile?: boolean;
  invalidRole?: boolean;
};

/**
 * Existing auth helpers — `POST /api/auth/resolve-profile`, `forgot-password`.
 * Sign-in / sign-up remain Supabase Auth (not duplicated here).
 */
export function createAuthApi(client: ApiClient) {
  return {
    resolveProfile(
      accessToken: string,
    ): Promise<ApiResult<ResolveProfileResponse | ResolveProfileFailureBody>> {
      return client.requestJson("/api/auth/resolve-profile", {
        method: "POST",
        skipAuth: true,
        json: { access_token: accessToken },
      });
    },

    forgotPassword(email: string): Promise<
      ApiResult<{ sent?: boolean; code?: string; error?: string }>
    > {
      return client.requestJson("/api/auth/forgot-password", {
        method: "POST",
        skipAuth: true,
        json: { email },
      });
    },
  };
}

export type AuthApi = ReturnType<typeof createAuthApi>;
