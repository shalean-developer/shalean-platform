export type AuthCallbackBootstrapResult =
  | { ok: true }
  | { ok: false; reason: "missing_session"; message: string };

type SessionLike = unknown | null;

type AuthSubscription = {
  unsubscribe: () => void;
};

type AuthLike = {
  getSession: () => Promise<{ data: { session: SessionLike } }>;
  onAuthStateChange: (
    callback: (event: string, session: SessionLike) => void,
  ) => { data: { subscription: AuthSubscription } };
};

/**
 * Wait for @supabase/ssr browser-client initialization to establish the callback
 * session. createBrowserClient enables URL session detection, so the callback
 * must not call exchangeCodeForSession() a second time.
 */
export async function bootstrapAuthCallbackSession(
  auth: AuthLike,
  options?: { timeoutMs?: number },
): Promise<AuthCallbackBootstrapResult> {
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

    const { data: { subscription } } = auth.onAuthStateChange((_event, session) => {
      if (session) finish({ ok: true });
    });

    timeout = setTimeout(() => {
      finish({
        ok: false,
        reason: "missing_session",
        message: "No sign-in session found. Open the link from your email again, or request a new link.",
      });
    }, timeoutMs);

    // Close the race where URL detection finishes between the first getSession()
    // call and listener registration.
    void auth.getSession().then(({ data }) => {
      if (data.session) finish({ ok: true });
    });
  });
}
