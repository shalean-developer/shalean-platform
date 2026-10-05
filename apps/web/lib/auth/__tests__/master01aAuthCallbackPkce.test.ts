import { describe, expect, it, vi } from "vitest";
import { bootstrapAuthCallbackSession } from "@/lib/auth/bootstrapAuthCallbackSession";

describe("MASTER-01A-01 auth callback session source of truth", () => {
  it("imports implicit magic-link tokens into the SSR browser client", async () => {
    const auth = {
      setSession: vi.fn(async () => ({ error: null })),
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(),
    };

    const result = await bootstrapAuthCallbackSession(
      auth,
      "https://example.test/auth/callback#access_token=access&refresh_token=refresh&type=magiclink",
      { timeoutMs: 10 },
    );

    expect(result).toEqual({ ok: true });
    expect(auth.setSession).toHaveBeenCalledWith({
      access_token: "access",
      refresh_token: "refresh",
    });
    expect(auth.getSession).not.toHaveBeenCalled();
  });

  it("fails closed when implicit token import fails", async () => {
    const auth = {
      setSession: vi.fn(async () => ({ error: { message: "invalid refresh token" } })),
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(),
    };

    const result = await bootstrapAuthCallbackSession(
      auth,
      "https://example.test/auth/callback#access_token=access&refresh_token=refresh",
      { timeoutMs: 10 },
    );

    expect(result).toEqual({
      ok: false,
      reason: "session_error",
      message: "invalid refresh token",
    });
  });

  it("accepts a session already established by automatic URL detection", async () => {
    const auth = {
      setSession: vi.fn(),
      getSession: vi.fn(async () => ({
        data: { session: { access_token: "token" } },
      })),
      onAuthStateChange: vi.fn(),
    };

    const result = await bootstrapAuthCallbackSession(
      auth,
      "https://example.test/auth/callback?code=pkce-code",
      { timeoutMs: 10 },
    );

    expect(result).toEqual({ ok: true });
    expect(auth.setSession).not.toHaveBeenCalled();
    expect(auth.onAuthStateChange).not.toHaveBeenCalled();
  });

  it("waits for an automatically detected auth-state session without exchanging a code twice", async () => {
    const unsubscribe = vi.fn();
    const auth = {
      setSession: vi.fn(),
      getSession: vi
        .fn()
        .mockResolvedValueOnce({ data: { session: null } })
        .mockResolvedValueOnce({ data: { session: null } }),
      onAuthStateChange: vi.fn((cb: (event: string, session: unknown | null) => void) => {
        queueMicrotask(() => cb("SIGNED_IN", { access_token: "token" }));
        return { data: { subscription: { unsubscribe } } };
      }),
    };

    const result = await bootstrapAuthCallbackSession(
      auth,
      "https://example.test/auth/callback?code=pkce-code",
      { timeoutMs: 100 },
    );

    expect(result).toEqual({ ok: true });
    expect(auth.setSession).not.toHaveBeenCalled();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("fails closed when no callback session appears", async () => {
    vi.useFakeTimers();
    try {
      const unsubscribe = vi.fn();
      const auth = {
        setSession: vi.fn(),
        getSession: vi.fn(async () => ({ data: { session: null } })),
        onAuthStateChange: vi.fn(() => ({
          data: { subscription: { unsubscribe } },
        })),
      };

      const pending = bootstrapAuthCallbackSession(
        auth,
        "https://example.test/auth/callback",
        { timeoutMs: 50 },
      );
      await vi.advanceTimersByTimeAsync(50);

      await expect(pending).resolves.toEqual({
        ok: false,
        reason: "missing_session",
        message: "No sign-in session found. Open the link from your email again, or request a new link.",
      });
      expect(unsubscribe).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
