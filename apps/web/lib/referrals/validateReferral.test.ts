import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { validateReferralForCheckout } from "@/lib/referrals/validateReferral";

function chainMaybeSingle<T>(result: { data: T; error: { message: string } | null }) {
  const api = {
    select: () => api,
    eq: () => api,
    maybeSingle: vi.fn(async () => result),
  };
  return api;
}

function mockAdminForUnknownCode(): SupabaseClient {
  return {
    from: (table: string) => {
      if (table === "user_profiles" || table === "cleaners") {
        return chainMaybeSingle({ data: null, error: null });
      }
      return chainMaybeSingle({ data: null, error: null });
    },
  } as unknown as SupabaseClient;
}

describe("validateReferralForCheckout", () => {
  it("rejects invalid referral code", async () => {
    const result = await validateReferralForCheckout({
      admin: mockAdminForUnknownCode(),
      code: "FAKECODE",
      userId: "user-1",
      customerEmail: "buyer@example.com",
    });
    expect(result.valid).toBe(false);
  });

  it("rejects blank code", async () => {
    const result = await validateReferralForCheckout({
      admin: mockAdminForUnknownCode(),
      code: "   ",
      userId: null,
      customerEmail: "buyer@example.com",
    });
    expect(result.valid).toBe(false);
  });
});
