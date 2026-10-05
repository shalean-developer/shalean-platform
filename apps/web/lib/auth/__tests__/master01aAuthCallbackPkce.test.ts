import { describe, expect, it, vi } from "vitest";
import { bootstrapAuthCallbackSession } from "@/lib/auth/bootstrapAuthCallbackSession";

describe("MASTER-01A-01 auth callback PKCE bootstrap", () => {
  it("exchanges a PKCE code before reading the session", async () => {
    const calls: string[] = [];
    const auth = {
      exchangeCodeForSession: vi.fn(async (code: string) => {
        calls.push(`exchange:${code}`);
        return { error: null };
      }),
      getSession: vi.fn(async () => {
        calls.push("session");
        return { data: { session: { access_token: "token" } } };
      }),
    };

    const result = await bootstrapAuthCallbackSession(
      auth,
      "https://example.test/auth/callback?code=pkce-code",
      { pollAttempts: 1, pollDelayMs: 0 },
    );

    expect(result).toEqual({ ok: true });
    expect(calls).toEqual(["exchange:pkce-code", "session"]);
  });

  it("returns an exchange error without treating the callback as signed in", async () => {
    const auth = {
      exchangeCodeForSession: vi.fn(async () => ({
        error: { message: "invalid flow state" },
      })),
      getSession: vi.fn(async () => ({
        data: { session: { access_token: "stale" } },
      })),
    };

    const result = await bootstrapAuthCallbackSession(
      auth,
      "https://example.test/auth/callback?code=bad-code",
      { pollAttempts: 1, pollDelayMs: 0 },
    );

    expect(result).toEqual({
      ok: false,
      reason: "exchange_failed",
      message: "invalid flow state",
    });
    expect(auth.getSession).not.toHaveBeenCalled();
  });

  it("keeps the existing-session fallback for callbacks without a PKCE code", async () => {
    const auth = {
      exchangeCodeForSession: vi.fn(async () => ({ error: null })),
      getSession: vi.fn(async () => ({
        data: { session: { access_token: "token" } },
      })),
    };

    const result = await bootstrapAuthCallbackSession(
      auth,
      "https://example.test/auth/callback",
      { pollAttempts: 1, pollDelayMs: 0 },
    );

    expect(result).toEqual({ ok: true });
    expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("fails closed when no session appears", async () => {
    const auth = {
      exchangeCodeForSession: vi.fn(async () => ({ error: null })),
      getSession: vi.fn(async () => ({ data: { session: null } })),
    };

    const result = await bootstrapAuthCallbackSession(
      auth,
      "https://example.test/auth/callback",
      { pollAttempts: 2, pollDelayMs: 0 },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("missing_session");
    expect(auth.getSession).toHaveBeenCalledTimes(2);
  });
});
