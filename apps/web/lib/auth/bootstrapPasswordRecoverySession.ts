/**
 * Client-side recovery session bootstrap for `/auth/reset-password`.
 * Handles PKCE `?code=`, hash tokens, and Supabase error query params.
 */

export type RecoveryBootstrapResult =
  | { ok: true }
  | { ok: false; reason: "not_configured" | "auth_error" | "expired_or_invalid"; message: string };

type AuthLike = {
  exchangeCodeForSession: (code: string) => Promise<{ error: { message: string } | null }>;
  setSession: (tokens: {
    access_token: string;
    refresh_token: string;
  }) => Promise<{ error: { message: string } | null }>;
  getSession: () => Promise<{ data: { session: unknown | null } }>;
};

function readSearchParams(href: string): URLSearchParams {
  try {
    return new URL(href).searchParams;
  } catch {
    return new URLSearchParams();
  }
}

function readHashParams(href: string): URLSearchParams {
  try {
    const hash = new URL(href).hash.replace(/^#/, "");
    return new URLSearchParams(hash);
  } catch {
    return new URLSearchParams();
  }
}

export function recoveryErrorFromUrl(href: string): string | null {
  const q = readSearchParams(href);
  const h = readHashParams(href);
  const err =
    q.get("error_description") ||
    q.get("error") ||
    h.get("error_description") ||
    h.get("error") ||
    q.get("error_code") ||
    h.get("error_code");
  if (!err) return null;
  const normalized = err.replace(/\+/g, " ").trim();
  if (!normalized) return null;
  return normalized;
}

export function isExpiredRecoveryMessage(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("expired") ||
    m.includes("invalid") ||
    m.includes("otp_expired") ||
    m.includes("flow_state") ||
    m.includes("already been used")
  );
}

/**
 * Establish a PASSWORD_RECOVERY session from the current URL, then poll briefly.
 */
export async function bootstrapPasswordRecoverySession(
  auth: AuthLike,
  href: string,
  options?: { pollAttempts?: number; pollDelayMs?: number },
): Promise<RecoveryBootstrapResult> {
  const urlError = recoveryErrorFromUrl(href);
  if (urlError) {
    return {
      ok: false,
      reason: isExpiredRecoveryMessage(urlError) ? "expired_or_invalid" : "auth_error",
      message: isExpiredRecoveryMessage(urlError)
        ? "This reset link is invalid or has expired. Request a new one from the sign-in page."
        : urlError,
    };
  }

  const search = readSearchParams(href);
  const hash = readHashParams(href);
  const code = (search.get("code") ?? "").trim();
  if (code) {
    const { error } = await auth.exchangeCodeForSession(code);
    if (error) {
      const msg = error.message || "Could not verify reset link.";
      return {
        ok: false,
        reason: isExpiredRecoveryMessage(msg) ? "expired_or_invalid" : "auth_error",
        message: isExpiredRecoveryMessage(msg)
          ? "This reset link is invalid or has expired. Request a new one from the sign-in page."
          : msg,
      };
    }
  } else {
    const access_token = (hash.get("access_token") ?? search.get("access_token") ?? "").trim();
    const refresh_token = (hash.get("refresh_token") ?? search.get("refresh_token") ?? "").trim();
    const type = (hash.get("type") ?? search.get("type") ?? "").trim().toLowerCase();
    if (access_token && refresh_token && (type === "recovery" || type === "")) {
      const { error } = await auth.setSession({ access_token, refresh_token });
      if (error) {
        const msg = error.message || "Could not verify reset link.";
        return {
          ok: false,
          reason: isExpiredRecoveryMessage(msg) ? "expired_or_invalid" : "auth_error",
          message: isExpiredRecoveryMessage(msg)
            ? "This reset link is invalid or has expired. Request a new one from the sign-in page."
            : msg,
        };
      }
    }
  }

  const attempts = options?.pollAttempts ?? 20;
  const delayMs = options?.pollDelayMs ?? 200;
  for (let i = 0; i < attempts; i++) {
    const { data } = await auth.getSession();
    if (data.session) return { ok: true };
    await new Promise((r) => setTimeout(r, delayMs));
  }

  return {
    ok: false,
    reason: "expired_or_invalid",
    message: "This reset link is invalid or has expired. Request a new one from the sign-in page.",
  };
}
