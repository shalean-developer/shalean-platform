import { describe, expect, it, vi } from "vitest";
import { bootstrapAuthCallbackSession } from "@/lib/auth/bootstrapAuthCallbackSession";

describe("MASTER-01A-01 auth callback session bootstrap", () => {
  it("accepts a session already established by @supabase/ssr URL detection", async () => {
    const auth = {
      getSession: vi.fn(async () => ({
        data: { session: { access_token: "token" } },
      })),
      onAuthStateChange: vi.fn(),
    };

    const result = await bootstrapAuthCallbackSession(auth, { timeoutMs: 10 });

    expect(result).toEqual({ ok: true });
    expect(auth.onAuthStateChange).not.toHaveBeenCalled();
  });

  it("waits for an auth-state session instead of exchanging the PKCE code twice", async () => {
    const unsubscribe = vi.fn();
    const auth = {
      getSession: vi
        .fn()
        .mockResolvedValueOnce({ data: { session: null } })
        .mockResolvedValueOnce({ data: { session: null } }),
      onAuthStateChange: vi.fn((cb: (event: string, session: unknown | null) => void) => {
        queueMicrotask(() => cb("SIGNED_IN", { access_token: "token" }));
        return { data: { subscription: { unsubscribe } } };
      }),
    };

    const result = await bootstrapAuthCallbackSession(auth, { timeoutMs: 100 });

    expect(result).toEqual({ ok: true });
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("closes the race if a session appears immediately after listener registration", async () => {
    const unsubscribe = vi.fn();
    const auth = {
      getSession: vi
        .fn()
        .mockResolvedValueOnce({ data: { session: null } })
        .mockResolvedValueOnce({ data: { session: { access_token: "token" } } }),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe } },
      })),
    };

    const result = await bootstrapAuthCallbackSession(auth, { timeoutMs: 100 });

    expect(result).toEqual({ ok: true });
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("fails closed when automatic callback detection never establishes a session", async () => {
    vi.useFakeTimers();
    try {
      const unsubscribe = vi.fn();
      const auth = {
        getSession: vi.fn(async () => ({ data: { session: null } })),
        onAuthStateChange: vi.fn(() => ({
          data: { subscription: { unsubscribe } },
        })),
      };

      const pending = bootstrapAuthCallbackSession(auth, { timeoutMs: 50 });
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
