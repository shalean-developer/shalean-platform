export type AuthCallbackBootstrapResult =
  | { ok: true }
  | { ok: false; reason: "exchange_failed" | "missing_session"; message: string };

type AuthLike = {
  exchangeCodeForSession: (code: string) => Promise<{ error: { message?: string | null } | null }>;
  getSession: () => Promise<{ data: { session: unknown | null } }>;
};

function codeFromHref(href: string): string {
  try {
    return new URL(href).searchParams.get("code")?.trim() ?? "";
  } catch {
    return "";
  }
}

/**
 * Establish the Supabase session for the generic auth callback.
 *
 * @supabase/ssr uses PKCE by default. When Supabase redirects back with ?code=,
 * the code must be exchanged before a browser session exists. Older implicit
 * links may already have populated a session, so we still support the
 * session-polling fallback when no code is present.
 */
export async function bootstrapAuthCallbackSession(
  auth: AuthLike,
  href: string,
  options?: { pollAttempts?: number; pollDelayMs?: number },
): Promise<AuthCallbackBootstrapResult> {
  const code = codeFromHref(href);
  if (code) {
    const { error } = await auth.exchangeCodeForSession(code);
    if (error) {
      return {
        ok: false,
        reason: "exchange_failed",
        message: error.message?.trim() || "Could not complete sign-in.",
      };
    }
  }

  const attempts = options?.pollAttempts ?? 12;
  const delayMs = options?.pollDelayMs ?? 300;
  for (let i = 0; i < attempts; i++) {
    const { data } = await auth.getSession();
    if (data.session) return { ok: true };
    if (i + 1 < attempts) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return {
    ok: false,
    reason: "missing_session",
    message: "No sign-in session found. Open the link from your email again, or request a new link.",
  };
}
