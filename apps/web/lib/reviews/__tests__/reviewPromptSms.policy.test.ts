import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { processReviewSmsPromptQueue } from "@/lib/reviews/reviewPromptSms";

describe("processReviewSmsPromptQueue communication policy", () => {
  it("preserves queued rows when customer SMS is disabled", async () => {
    const from = vi.fn(() => {
      throw new Error("queue must not be read, updated, or deleted while SMS is policy-blocked");
    });
    const supabase = { from } as unknown as SupabaseClient;

    const result = await processReviewSmsPromptQueue(supabase);

    expect(result).toEqual({
      firstSent: 0,
      remindersSent: 0,
      skipped: 0,
      policyBlockedReason: "sms_outbound_disabled_whatsapp_primary",
    });
    expect(from).not.toHaveBeenCalled();
  });
});
