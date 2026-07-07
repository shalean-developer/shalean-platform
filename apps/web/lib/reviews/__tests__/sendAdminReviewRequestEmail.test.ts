import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sendReviewEmail: vi.fn(),
}));

vi.mock("@/lib/email/lifecycleEmails", () => ({
  sendReviewEmail: mocks.sendReviewEmail,
}));

import { sendAdminReviewRequestEmail } from "@/lib/reviews/sendAdminReviewRequestEmail";

function makeAdmin(booking: Record<string, unknown> | null, review: { id: string } | null) {
  const chain = {
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn(),
  };
  const from = vi.fn((table: string) => {
    if (table === "bookings") {
      chain.maybeSingle.mockResolvedValue({ data: booking, error: null });
      return { select: vi.fn().mockReturnValue(chain) };
    }
    if (table === "reviews") {
      chain.maybeSingle.mockResolvedValue({ data: review, error: null });
      return { select: vi.fn().mockReturnValue(chain) };
    }
    throw new Error(`unexpected table ${table}`);
  });
  return { from } as unknown as import("@supabase/supabase-js").SupabaseClient;
}

const completedBooking = {
  id: "b1",
  customer_email: "guest@example.com",
  status: "completed",
  completed_at: new Date().toISOString(),
  cleaner_id: "c1",
  is_team_job: false,
  team_id: null,
  booking_snapshot: null,
  date: "2026-07-05",
};

describe("sendAdminReviewRequestEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sendReviewEmail.mockResolvedValue({ sent: true });
  });

  it("sends review email when booking is eligible", async () => {
    const admin = makeAdmin(completedBooking, null);
    const result = await sendAdminReviewRequestEmail(admin, "b1");
    expect(result).toEqual({ ok: true, sentTo: "guest@example.com" });
    expect(mocks.sendReviewEmail).toHaveBeenCalledWith(
      expect.objectContaining({ bookingId: "b1", to: "guest@example.com" }),
      expect.objectContaining({ logPromptKpi: true, promptKind: "manual", source: "admin_booking_action" }),
    );
  });

  it("rejects when review already exists", async () => {
    const admin = makeAdmin(completedBooking, { id: "r1" });
    const result = await sendAdminReviewRequestEmail(admin, "b1");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("review_exists");
    expect(mocks.sendReviewEmail).not.toHaveBeenCalled();
  });

  it("rejects incomplete bookings", async () => {
    const admin = makeAdmin({ ...completedBooking, status: "assigned", completed_at: null }, null);
    const result = await sendAdminReviewRequestEmail(admin, "b1");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("review_prompt_booking_not_completed");
  });
});
