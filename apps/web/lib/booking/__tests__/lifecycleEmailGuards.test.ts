import { describe, expect, it, vi, afterEach } from "vitest";

import {

  classifySendError,

  computeAppointmentStartIso,

  evaluateRebookSkipForCustomer,

  evaluateStaleJob,

  isRebookLifecycleJobType,

} from "@/lib/booking/lifecycleEmailGuards";

import { LIFECYCLE_SKIP } from "@/lib/booking/lifecycleEmailSkipReasons";

import { resolveEffectiveSettings } from "@/lib/booking/lifecycleEmailSettings";



describe("lifecycleEmailGuards", () => {

  it("computeAppointmentStartIso from booking snapshot", () => {

    const iso = computeAppointmentStartIso({

      booking_snapshot: {

        locked: { date: "2026-06-15", time: "10:30", service: "standard" },

      } as never,

    });

    expect(iso).toBeTruthy();

    expect(iso).toContain("2026-06-15");

  });



  it("skips reminder_24h when appointment already passed", () => {

    const past = new Date(Date.now() - 60_000).toISOString();

    const result = evaluateStaleJob({

      jobType: "reminder_24h",

      appointmentStartIso: past,

    });

    expect(result.stale).toBe(true);

    if (result.stale) expect(result.reason).toBe(LIFECYCLE_SKIP.appointmentAlreadyPassed);

  });



  it("skips review_request when appointment window expired (>7d)", () => {

    const old = new Date(Date.now() - 8 * 24 * 60 * 60_000).toISOString();

    const result = evaluateStaleJob({

      jobType: "review_request",

      appointmentStartIso: old,

    });

    expect(result.stale).toBe(true);

    if (result.stale) expect(result.reason).toBe(LIFECYCLE_SKIP.reviewRequestTooOld);

  });



  it("classifies invalid email as terminal", () => {

    expect(classifySendError("Invalid email address")).toBe("terminal");

    expect(classifySendError("Rate limit exceeded")).toBe("retryable");

  });



  it("isRebookLifecycleJobType identifies rebook job types", () => {

    expect(isRebookLifecycleJobType("rebook_offer")).toBe(true);

    expect(isRebookLifecycleJobType("rebook_reminder")).toBe(true);

    expect(isRebookLifecycleJobType("reminder_24h")).toBe(false);

  });



  it("evaluateRebookSkipForCustomer skips recurring occurrence bookings", async () => {

    const supabase = { from: vi.fn() };

    const result = await evaluateRebookSkipForCustomer({

      supabase: supabase as never,

      userId: "user-1",

      recurringId: "rec-1",

    });

    expect(result).toEqual({ skip: true, reason: LIFECYCLE_SKIP.customerHasActiveRecurringPlan });

    expect(supabase.from).not.toHaveBeenCalled();

  });



  it("evaluateRebookSkipForCustomer skips when customer has active recurring plan", async () => {

    const supabase = {

      from: vi.fn(() => ({

        select: vi.fn(() => ({

          eq: vi.fn(() => ({

            in: vi.fn(() => Promise.resolve({ count: 1, error: null })),

          })),

        })),

      })),

    };

    const result = await evaluateRebookSkipForCustomer({

      supabase: supabase as never,

      userId: "user-1",

    });

    expect(result).toEqual({ skip: true, reason: LIFECYCLE_SKIP.customerHasActiveRecurringPlan });

  });

});



describe("resolveEffectiveSettings", () => {

  const base = { emailsEnabled: true, dryRunEnabled: false, frequencyLimitEnabled: true };



  afterEach(() => {

    delete process.env.LIFECYCLE_EMAILS_ENABLED;

    delete process.env.LIFECYCLE_EMAILS_DRY_RUN;

  });



  it("env LIFECYCLE_EMAILS_ENABLED=false forces pause", () => {

    process.env.LIFECYCLE_EMAILS_ENABLED = "false";

    const s = resolveEffectiveSettings(base);

    expect(s.emailsEnabled).toBe(false);

    expect(s.pausedByEnv).toBe(true);

  });



  it("env LIFECYCLE_EMAILS_DRY_RUN=true forces dry run", () => {

    process.env.LIFECYCLE_EMAILS_DRY_RUN = "true";

    const s = resolveEffectiveSettings(base);

    expect(s.dryRunEnabled).toBe(true);

    expect(s.dryRunByEnv).toBe(true);

  });

});

