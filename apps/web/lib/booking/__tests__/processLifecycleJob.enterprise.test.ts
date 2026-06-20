import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { LIFECYCLE_SKIP } from "@/lib/booking/lifecycleEmailSkipReasons";



const mocks = vi.hoisted(() => ({

  sendReminderEmail: vi.fn(),

  sendReviewEmail: vi.fn(),

  sendRebookEmail: vi.fn(),

  sendRebookReminderEmail: vi.fn(),

  getEffectiveLifecycleEmailSettings: vi.fn(),

  incrementLifecycleMetric: vi.fn().mockResolvedValue(undefined),

  logSystemEvent: vi.fn().mockResolvedValue(undefined),

  reportOperationalIssue: vi.fn().mockResolvedValue(undefined),

  evaluateCustomerFrequencyLimit: vi.fn(),

  evaluateRebookEligibility: vi.fn(),

}));



vi.mock("@/lib/email/lifecycleEmails", () => ({

  sendReminderEmail: mocks.sendReminderEmail,

  sendReviewEmail: mocks.sendReviewEmail,

  sendRebookEmail: mocks.sendRebookEmail,

  sendRebookReminderEmail: mocks.sendRebookReminderEmail,

  buildLifecycleEmailPreview: vi.fn(() => ({ subject: "Test", html: "<p>test</p>" })),

}));



vi.mock("@/lib/booking/lifecycleEmailSettings", () => ({

  getEffectiveLifecycleEmailSettings: mocks.getEffectiveLifecycleEmailSettings,

}));



vi.mock("@/lib/booking/lifecycleEmailMetrics", () => ({

  incrementLifecycleMetric: mocks.incrementLifecycleMetric,

}));



vi.mock("@/lib/logging/systemLog", () => ({

  logSystemEvent: mocks.logSystemEvent,

  reportOperationalIssue: mocks.reportOperationalIssue,

}));



vi.mock("@/lib/booking/lifecycleEmailGuards", async (importOriginal) => {

  const actual = await importOriginal<typeof import("@/lib/booking/lifecycleEmailGuards")>();

  return {

    ...actual,

    evaluateCustomerFrequencyLimit: mocks.evaluateCustomerFrequencyLimit,

    evaluateRebookEligibility: mocks.evaluateRebookEligibility,

  };

});



import { processLifecycleJob } from "@/lib/booking/processLifecycleJob";



type JobState = {

  id: string;

  booking_id: string;

  job_type: string;

  customer_email: string;

  status: string;

  attempts: number;

  sent_at: string | null;

  last_error: string | null;

  skipped_reason: string | null;

  processed_at: string | null;

};



function futureAppointmentSnapshot() {

  const d = new Date();

  d.setUTCDate(d.getUTCDate() + 3);

  const dateYmd = d.toISOString().slice(0, 10);

  return {

    locked: { date: dateYmd, time: "09:00", service: "standard", location: "Cape Town" },

  };

}



function pastAppointmentSnapshot() {

  const d = new Date();

  d.setUTCDate(d.getUTCDate() - 2);

  const dateYmd = d.toISOString().slice(0, 10);

  return {

    locked: { date: dateYmd, time: "09:00", service: "standard", location: "Cape Town" },

  };

}



function createMockSupabase(params: {

  job: JobState;

  booking: Record<string, unknown>;

  sentHistory?: { sent_at: string }[];

}) {

  let job = { ...params.job };

  const sentHistory = params.sentHistory ?? [];



  const from = vi.fn((table: string) => {

    const chain: Record<string, unknown> = {};

    const self = () => chain as never;



    chain.select = vi.fn(() => self());

    chain.eq = vi.fn(() => self());

    chain.in = vi.fn(() => self());

    chain.gte = vi.fn(() => self());

    chain.lt = vi.fn(() => self());

    chain.neq = vi.fn(() => self());

    chain.not = vi.fn(() => self());

    chain.is = vi.fn(() => self());

    chain.order = vi.fn(() => self());

    chain.limit = vi.fn(() => self());

    chain.range = vi.fn(() => self());

    chain.maybeSingle = vi.fn(async () => {

      if (table === "booking_lifecycle_jobs") {

        return { data: { sent_at: job.sent_at, status: job.status, attempts: job.attempts }, error: null };

      }

      if (table === "bookings") return { data: params.booking, error: null };

      if (table === "lifecycle_email_settings") {

        return {

          data: { emails_enabled: true, dry_run_enabled: false, frequency_limit_enabled: true },

          error: null,

        };

      }

      return { data: null, error: null };

    });



    chain.update = vi.fn((patch: Partial<JobState>) => {

      const applyPatch = () => {

        if (table === "booking_lifecycle_jobs") {

          job = { ...job, ...patch };

        }

      };

      const updateChain: Record<string, unknown> = {};

      updateChain.eq = vi.fn(() => updateChain);

      updateChain.in = vi.fn(() => updateChain);

      updateChain.is = vi.fn(() => updateChain);

      updateChain.then = (resolve: (v: unknown) => void) => {

        applyPatch();

        if (patch.status === "sent") {

          resolve({ data: [{ id: job.id }], error: null });

        } else {

          resolve({ error: null });

        }

      };

      updateChain.select = vi.fn((_cols?: string) => {

        const selectChain: Record<string, unknown> = {};

        selectChain.maybeSingle = vi.fn(async () => {

          if (table === "booking_lifecycle_jobs" && patch.status === "processing") {

            if (!["pending", "failed_retryable"].includes(job.status)) {

              return { data: null, error: null };

            }

          }

          applyPatch();

          return { data: { attempts: job.attempts }, error: null };

        });

        if (patch.status === "sent") {

          applyPatch();

          return Promise.resolve({ data: [{ id: job.id }], error: null });

        }

        selectChain.then = updateChain.then;

        return selectChain;

      });

      return updateChain;

    });



    chain.insert = vi.fn(() => ({ error: null }));



    if (table === "booking_lifecycle_jobs") {

      chain.select = vi.fn((_cols?: string, opts?: { count?: string; head?: boolean }) => {

        if (opts?.head) {

          return Promise.resolve({ count: sentHistory.length, error: null });

        }

        return self();

      });

    }



    return chain;

  });



  return {

    from,

    getJob: () => job,

  };

}



describe("processLifecycleJob enterprise scenarios", () => {

  beforeEach(() => {

    vi.clearAllMocks();

    mocks.getEffectiveLifecycleEmailSettings.mockResolvedValue({

      emailsEnabled: true,

      dryRunEnabled: false,

      frequencyLimitEnabled: true,

      pausedByEnv: false,

      dryRunByEnv: false,

    });

    mocks.evaluateRebookEligibility.mockResolvedValue({ eligible: true });

    mocks.evaluateCustomerFrequencyLimit.mockResolvedValue({ limited: false });

    mocks.sendReminderEmail.mockResolvedValue({ sent: true });

    mocks.sendReviewEmail.mockResolvedValue({ sent: true });

    mocks.sendRebookEmail.mockResolvedValue({ sent: true });

    mocks.sendRebookReminderEmail.mockResolvedValue({ sent: true });

  });



  afterEach(() => {

    delete process.env.RESEND_API_KEY;

  });



  it("Scenario 7: old reminder job → skipped, no email sent", async () => {

    const mock = createMockSupabase({

      job: {

        id: "job-1",

        booking_id: "book-1",

        job_type: "reminder_24h",

        customer_email: "customer@example.com",

        status: "pending",

        attempts: 0,

        sent_at: null,

        last_error: null,

        skipped_reason: null,

        processed_at: null,

      },

      booking: {

        id: "book-1",

        status: "assigned",

        payment_status: "success",

        service: "standard",

        booking_snapshot: pastAppointmentSnapshot(),

        location: "Cape Town",

        cleaner_id: "c1",

      },

    });



    const result = await processLifecycleJob(mock as never, {

      id: "job-1",

      booking_id: "book-1",

      job_type: "reminder_24h",

      customer_email: "customer@example.com",

      attempts: 0,

    });



    expect(result).toBe("skipped");

    expect(mocks.sendReminderEmail).not.toHaveBeenCalled();

    expect(mock.getJob().status).toBe("skipped");

    expect(mock.getJob().skipped_reason).toBe(LIFECYCLE_SKIP.appointmentAlreadyPassed);

  });



  it("Scenario 8: Resend failure → failed_retryable, attempts increment", async () => {

    mocks.sendReminderEmail.mockResolvedValue({ sent: false, error: "Email not configured" });



    const mock = createMockSupabase({

      job: {

        id: "job-2",

        booking_id: "book-2",

        job_type: "reminder_24h",

        customer_email: "customer@example.com",

        status: "pending",

        attempts: 0,

        sent_at: null,

        last_error: null,

        skipped_reason: null,

        processed_at: null,

      },

      booking: {

        id: "book-2",

        status: "assigned",

        payment_status: "success",

        service: "standard",

        booking_snapshot: futureAppointmentSnapshot(),

        location: "Cape Town",

        cleaner_id: "c1",

      },

    });



    const result = await processLifecycleJob(mock as never, {

      id: "job-2",

      booking_id: "book-2",

      job_type: "reminder_24h",

      customer_email: "customer@example.com",

      attempts: 0,

    });



    expect(result).toBe("retry");

    expect(mock.getJob().status).toBe("failed_retryable");

    expect(mock.getJob().attempts).toBe(1);

  });



  it("Scenario 8: invalid email → failed_terminal", async () => {

    const mock = createMockSupabase({

      job: {

        id: "job-invalid",

        booking_id: "book-invalid",

        job_type: "reminder_24h",

        customer_email: "",

        status: "pending",

        attempts: 0,

        sent_at: null,

        last_error: null,

        skipped_reason: null,

        processed_at: null,

      },

      booking: {

        id: "book-invalid",

        status: "assigned",

        payment_status: "success",

        booking_snapshot: futureAppointmentSnapshot(),

      },

    });



    const result = await processLifecycleJob(mock as never, {

      id: "job-invalid",

      booking_id: "book-invalid",

      job_type: "reminder_24h",

      customer_email: "",

      attempts: 0,

    });



    expect(result).toBe("terminal");

    expect(mock.getJob().status).toBe("failed_terminal");

  });



  it("frequency limit skip", async () => {

    mocks.evaluateCustomerFrequencyLimit.mockResolvedValue({

      limited: true,

      reason: LIFECYCLE_SKIP.frequencyLimitReached,

    });

    const now = new Date().toISOString();

    const mock = createMockSupabase({

      job: {

        id: "job-3",

        booking_id: "book-3",

        job_type: "rebook_offer",

        customer_email: "customer@example.com",

        status: "pending",

        attempts: 0,

        sent_at: null,

        last_error: null,

        skipped_reason: null,

        processed_at: null,

      },

      booking: {

        id: "book-3",

        status: "completed",

        payment_status: "success",

        service: "standard",

        booking_snapshot: pastAppointmentSnapshot(),

        location: "Cape Town",

        cleaner_id: "c1",

        completed_at: now,

      },

      sentHistory: [{ sent_at: now }],

    });



    const result = await processLifecycleJob(mock as never, {

      id: "job-3",

      booking_id: "book-3",

      job_type: "rebook_offer",

      customer_email: "customer@example.com",

      attempts: 0,

    });



    expect(result).toBe("skipped");

    expect(mocks.sendRebookEmail).not.toHaveBeenCalled();

    expect(mock.getJob().skipped_reason).toBe(LIFECYCLE_SKIP.frequencyLimitReached);

  });



  it("dry run enabled → evaluated, logged, not sent, stays pending", async () => {

    mocks.getEffectiveLifecycleEmailSettings.mockResolvedValue({

      emailsEnabled: true,

      dryRunEnabled: true,

      frequencyLimitEnabled: true,

      pausedByEnv: false,

      dryRunByEnv: false,

    });



    const mock = createMockSupabase({

      job: {

        id: "job-4",

        booking_id: "book-4",

        job_type: "reminder_24h",

        customer_email: "customer@example.com",

        status: "pending",

        attempts: 0,

        sent_at: null,

        last_error: null,

        skipped_reason: null,

        processed_at: null,

      },

      booking: {

        id: "book-4",

        status: "assigned",

        payment_status: "success",

        service: "standard",

        booking_snapshot: futureAppointmentSnapshot(),

        location: "Cape Town",

        cleaner_id: "c1",

      },

    });



    const result = await processLifecycleJob(mock as never, {

      id: "job-4",

      booking_id: "book-4",

      job_type: "reminder_24h",

      customer_email: "customer@example.com",

      attempts: 0,

    });



    expect(result).toBe("skipped");

    expect(mocks.sendReminderEmail).not.toHaveBeenCalled();

    expect(mock.getJob().status).toBe("pending");

  });



  it("Scenario 2/3: rebook_reminder for recurring customer → skipped", async () => {

    mocks.evaluateRebookEligibility.mockResolvedValue({

      eligible: false,

      reason: LIFECYCLE_SKIP.customerHasActiveRecurringPlan,

    });

    const now = new Date().toISOString();

    const mock = createMockSupabase({

      job: {

        id: "job-6",

        booking_id: "book-6",

        job_type: "rebook_reminder",

        customer_email: "ninimarie116@gmail.com",

        status: "pending",

        attempts: 0,

        sent_at: null,

        last_error: null,

        skipped_reason: null,

        processed_at: null,

      },

      booking: {

        id: "book-6",

        status: "completed",

        payment_status: "success",

        service: "standard",

        booking_snapshot: pastAppointmentSnapshot(),

        location: "Cape Town",

        cleaner_id: "c1",

        completed_at: now,

        user_id: "user-recurring",

        recurring_id: "rec-plan-1",

      },

    });



    const result = await processLifecycleJob(mock as never, {

      id: "job-6",

      booking_id: "book-6",

      job_type: "rebook_reminder",

      customer_email: "ninimarie116@gmail.com",

      attempts: 0,

    });



    expect(result).toBe("skipped");

    expect(mocks.sendRebookReminderEmail).not.toHaveBeenCalled();

    expect(mock.getJob().skipped_reason).toBe(LIFECYCLE_SKIP.customerHasActiveRecurringPlan);

  });



  it("Scenario 4: rebook skipped when customer has future booking", async () => {

    mocks.evaluateRebookEligibility.mockResolvedValue({

      eligible: false,

      reason: LIFECYCLE_SKIP.customerHasFutureBooking,

    });

    const mock = createMockSupabase({

      job: {

        id: "job-7",

        booking_id: "book-7",

        job_type: "rebook_offer",

        customer_email: "customer@example.com",

        status: "pending",

        attempts: 0,

        sent_at: null,

        last_error: null,

        skipped_reason: null,

        processed_at: null,

      },

      booking: {

        id: "book-7",

        status: "completed",

        payment_status: "success",

        booking_snapshot: pastAppointmentSnapshot(),

        cleaner_id: "c1",

        completed_at: new Date().toISOString(),

      },

    });



    const result = await processLifecycleJob(mock as never, {

      id: "job-7",

      booking_id: "book-7",

      job_type: "rebook_offer",

      customer_email: "customer@example.com",

      attempts: 0,

    });



    expect(result).toBe("skipped");

    expect(mock.getJob().skipped_reason).toBe(LIFECYCLE_SKIP.customerHasFutureBooking);

  });



  it("Scenario 5: cancelled booking cancels job", async () => {

    const mock = createMockSupabase({

      job: {

        id: "job-8",

        booking_id: "book-8",

        job_type: "reminder_24h",

        customer_email: "customer@example.com",

        status: "pending",

        attempts: 0,

        sent_at: null,

        last_error: null,

        skipped_reason: null,

        processed_at: null,

      },

      booking: {

        id: "book-8",

        status: "cancelled",

        payment_status: "success",

        booking_snapshot: futureAppointmentSnapshot(),

      },

    });



    const result = await processLifecycleJob(mock as never, {

      id: "job-8",

      booking_id: "book-8",

      job_type: "reminder_24h",

      customer_email: "customer@example.com",

      attempts: 0,

    });



    expect(result).toBe("skipped");

    expect(mock.getJob().status).toBe("cancelled");

  });



  it("Scenario 6: marketing unsubscribe skips rebook but reminder still sends", async () => {

    mocks.evaluateRebookEligibility.mockResolvedValue({

      eligible: false,

      reason: LIFECYCLE_SKIP.customerUnsubscribed,

    });



    const rebookMock = createMockSupabase({

      job: {

        id: "job-rebook",

        booking_id: "book-r",

        job_type: "rebook_offer",

        customer_email: "customer@example.com",

        status: "pending",

        attempts: 0,

        sent_at: null,

        last_error: null,

        skipped_reason: null,

        processed_at: null,

      },

      booking: {

        id: "book-r",

        status: "completed",

        payment_status: "success",

        booking_snapshot: pastAppointmentSnapshot(),

        cleaner_id: "c1",

        completed_at: new Date().toISOString(),

      },

    });



    expect(

      await processLifecycleJob(rebookMock as never, {

        id: "job-rebook",

        booking_id: "book-r",

        job_type: "rebook_offer",

        customer_email: "customer@example.com",

        attempts: 0,

      }),

    ).toBe("skipped");



    mocks.evaluateRebookEligibility.mockResolvedValue({ eligible: true });

    const reminderMock = createMockSupabase({

      job: {

        id: "job-rem",

        booking_id: "book-r2",

        job_type: "reminder_24h",

        customer_email: "customer@example.com",

        status: "pending",

        attempts: 0,

        sent_at: null,

        last_error: null,

        skipped_reason: null,

        processed_at: null,

      },

      booking: {

        id: "book-r2",

        status: "assigned",

        payment_status: "success",

        booking_snapshot: futureAppointmentSnapshot(),

        cleaner_id: "c1",

      },

    });



    expect(

      await processLifecycleJob(reminderMock as never, {

        id: "job-rem",

        booking_id: "book-r2",

        job_type: "reminder_24h",

        customer_email: "customer@example.com",

        attempts: 0,

      }),

    ).toBe("sent");

    expect(mocks.sendReminderEmail).toHaveBeenCalled();

  });

});

