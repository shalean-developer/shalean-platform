export type AuthCallbackBootstrapResult =
  | { ok: true }
  | { ok: false; reason: "session_error" | "missing_session"; message: string };

type SessionLike = unknown | null;

type AuthSubscription = {
  unsubscribe: () => void;
};

type AuthLike = {
  setSession: (tokens: {
    access_token: string;
    refresh_token: string;
  }) => Promise<{ error: { message?: string | null } | null }>;
  getSession: () => Promise<{ data: { session: SessionLike } }>;
  onAuthStateChange: (
    callback: (event: string, session: SessionLike) => void,
  ) => { data: { subscription: AuthSubscription } };
};

function implicitTokensFromHref(
  href: string,
): { access_token: string; refresh_token: string } | null {
  try {
    const hash = new URL(href).hash.replace(/^#/, "");
    if (!hash) return null;
    const params = new URLSearchParams(hash);
    const access_token = params.get("access_token")?.trim() ?? "";
    const refresh_token = params.get("refresh_token")?.trim() ?? "";
    return access_token && refresh_token ? { access_token, refresh_token } : null;
  } catch {
    return null;
  }
}

/**
 * Establish the session for the guest magic-link callback.
 *
 * The guest-upgrade sender currently uses a plain supabase-js server client,
 * whose magic-link flow returns implicit access/refresh tokens in the URL
 * fragment. Import those tokens explicitly into the @supabase/ssr browser
 * client so they are persisted in its cookie-backed storage.
 *
 * For a future PKCE/code callback (or an already-established session), do not
 * exchange the code here: createBrowserClient performs URL detection itself.
 * Instead wait for its auth-state/session signal.
 */
export async function bootstrapAuthCallbackSession(
  auth: AuthLike,
  href: string,
  options?: { timeoutMs?: number },
): Promise<AuthCallbackBootstrapResult> {
  const implicitTokens = implicitTokensFromHref(href);
  if (implicitTokens) {
    const { error } = await auth.setSession(implicitTokens);
    if (error) {
      return {
        ok: false,
        reason: "session_error",
        message: error.message?.trim() || "Could not complete sign-in.",
      };
    }
    return { ok: true };
  }

  const existing = await auth.getSession();
  if (existing.data.session) return { ok: true };

  const timeoutMs = options?.timeoutMs ?? 4_000;

  return await new Promise<AuthCallbackBootstrapResult>((resolve) => {
    let settled = false;
    let timeout: ReturnType<typeof setTimeout> | null = null;

    const finish = (result: AuthCallbackBootstrapResult) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      subscription.unsubscribe();
      resolve(result);
    };

    const {
      data: { subscription },
    } = auth.onAuthStateChange((_event, session) => {
      if (session) finish({ ok: true });
    });

    timeout = setTimeout(() => {
      finish({
        ok: false,
        reason: "missing_session",
        message: "No sign-in session found. Open the link from your email again, or request a new link.",
      });
    }, timeoutMs);

    void auth.getSession().then(({ data }) => {
      if (data.session) finish({ ok: true });
    });
  });
}
