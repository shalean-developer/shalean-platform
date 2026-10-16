import { beforeEach, describe, expect, it, vi } from "vitest";
const { eligibility, claim, release, email, abandonedEmail, sms } = vi.hoisted(() => ({
  eligibility: vi.fn(), claim: vi.fn(), release: vi.fn(), email: vi.fn(), abandonedEmail: vi.fn(), sms: vi.fn(),
}));
const { recoveryEmail, expire, adminMock, persist } = vi.hoisted(() => ({ recoveryEmail: vi.fn(), expire: vi.fn(), adminMock: vi.fn(), persist: vi.fn() }));
const { providerSend } = vi.hoisted(() => ({ providerSend: vi.fn() }));
const { initialize, queueEmail, scheduleRecovery } = vi.hoisted(() => ({ initialize: vi.fn(), queueEmail: vi.fn(), scheduleRecovery: vi.fn() }));
vi.mock("@/lib/booking/paystackInitializeCore", () => ({ processPaystackInitializeBody: initialize }));
vi.mock("@/lib/booking/bookingPaymentRecoveryJobs", () => ({ scheduleBookingPaymentRecoveryJobs: scheduleRecovery }));
vi.mock("@/lib/conversion/deferredPaymentLinkEmailQueue", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/conversion/deferredPaymentLinkEmailQueue")>(), enqueueDeferredPaymentLinkEmail: queueEmail,
}));
vi.mock("@/lib/email/resendFrom", () => ({ getResend: () => ({ emails: { send: providerSend } }), getDefaultFromAddress: () => "office@example.com" }));
vi.mock("@/lib/templates/store", () => ({ getTemplate: async () => null }));
vi.mock("@/lib/email/recipientSafety", () => ({ validateEmailRecipients: () => ({ allowed: true }) }));
vi.mock("@/lib/env/outboundMessagingSafety", () => ({ decideOutboundEmail: () => ({ allowed: true }), applyOutboundSubjectPrefix: (subject: string) => subject }));
vi.mock("@/lib/email/syncResendAudienceContact", () => ({ syncResendAudienceContact: vi.fn() }));
vi.mock("@/lib/email/paymentRecoveryEmails", () => ({ buildPaymentRecoveryEmailContext: vi.fn(), sendPaymentRecoveryEmail: recoveryEmail }));
vi.mock("@/lib/booking/expirePendingPaymentTerminal", () => ({ expirePendingPaymentTerminal: expire }));
vi.mock("@/lib/pay/paymentLinkEligibility", () => ({ checkPaymentLinkEligibility: eligibility,
  claimAutomaticPaymentReminder: claim, releaseAutomaticPaymentReminder: release }));
vi.mock("@/lib/email/sendBookingEmail", () => ({ sendPaymentLinkEmail: email, sendAbandonedCheckoutReminderEmail: abandonedEmail }));
vi.mock("@/lib/templates/customerOutbound", () => ({ sendCustomerSmsPaymentLink: sms }));
vi.mock("@/lib/conversion/assignConversionExperiment", () => ({
  assignConversionExperimentVariant: vi.fn(async () => ({ variant: "control" })),
  maybeDelayPaymentLinkEmailExperiment: vi.fn(),
}));
vi.mock("@/lib/ai-autonomy/optimizeTiming", () => ({ applySendDelayIfNeeded: vi.fn() }));
vi.mock("@/lib/logging/systemLog", () => ({ logSystemEvent: vi.fn(), reportOperationalIssue: vi.fn() }));
vi.mock("@/lib/notifications/notificationEmailTelemetry", () => ({ logPipelineEmailTelemetry: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: adminMock }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: "admin-1", email: "admin@example.com" } }, error: null }) } }) }));
vi.mock("@/lib/auth/evaluateAdminAccess", () => ({ requireAdminUser: async () => ({ ok: true, userId: "admin-1" }) }));
vi.mock("@/lib/cron/cronLock", () => ({ acquireCronLock: vi.fn(async () => ({ ok: true, jobName: "reminders", holderId: "lock" })), releaseCronLock: vi.fn() }));
vi.mock("@/lib/customer/customerBookingsForUser", () => ({ resolveBookingOwnershipColumn: vi.fn(async () => "customer_id") }));
vi.mock("@/lib/pay/priorPaymentConversionBucket", () => ({ priorPaymentConversionBucketForCustomer: vi.fn(async () => null) }));
vi.mock("@/lib/pay/paymentDecisionDispatch", () => ({ fetchRecentPaymentLinkChannelStats: vi.fn(async () => ({})),
  resolvePaymentLinkDispatchDecision: vi.fn(async () => ({ send_now: true, phoneTryOrder: [] })), recordPaymentLinkDecision: vi.fn() }));
vi.mock("@/lib/admin/persistPaymentLinkDelivery", () => ({ persistPaymentLinkDelivery: persist }));

import { deliverAdminPaymentLink } from "@/lib/admin/adminPaymentLinkDelivery";
import { processDueDeferredPaymentLinkEmails } from "@/lib/conversion/deferredPaymentLinkEmailQueue";
import { processAbandonCheckoutReminders } from "@/lib/conversion/abandonCheckoutReminder";
import { processPaymentRecoveryJob } from "@/lib/booking/processPaymentRecoveryJob";
import { POST as runReminderCron } from "@/app/api/cron/payment-link-reminders/route";
import { POST as runAdminResend } from "@/app/api/admin/bookings/[id]/resend-payment-link/route";
import { sendAdminPaystackDeliveryForRow, type AdminPaystackBookingHead } from "@/lib/admin/adminPaystackPostInitialize";
import { runRecurringPaymentLinkFallback } from "@/lib/recurring/recurringPaymentLinkFallback";

const payload = { customerEmail: "customer@example.com", customerName: "Pat", serviceLabel: "Regular Cleaning",
  dateLabel: "2026-10-18", timeLabel: "09:00", amountZar: 458, paymentUrl: "https://checkout.paystack.com/test",
  bookingId: "booking-1", paystackReference: "bps_test" };
const wa = { customerName: "Pat", paymentLink: payload.paymentUrl, service: payload.serviceLabel, date: payload.dateLabel, time: payload.timeLabel };

function makeAdmin(reference: string | null = "bps_test", recoveryAttempts = 0, candidateCount = 1) {
  const updates: Record<string, unknown>[] = [];
  const admin = { from: (table: string) => {
    const chain = { select: vi.fn(() => chain), eq: vi.fn(() => chain), is: vi.fn(() => chain),
      gte: vi.fn(() => chain), lte: vi.fn(() => chain), order: vi.fn(() => chain), in: vi.fn(() => chain),
      update: vi.fn((patch: Record<string, unknown>) => { updates.push(patch); return chain; }),
      maybeSingle: vi.fn(async () => ({ data: table === "booking_payment_recovery_jobs"
        ? { id: "job-1", status: "pending", attempts: recoveryAttempts }
        : { id: "booking-1", status: "pending_payment", paystack_reference: reference, payment_link_delivery: {} }, error: null })),
      limit: vi.fn(async () => ({ data: Array.from({ length: candidateCount }, (_, index) => ({ id: `booking-${index + 1}`, customer_email: payload.customerEmail,
        customer_phone: "+27000000000", paystack_reference: reference })), error: null })),
    };
    return chain;
  }, rpc: vi.fn(async () => ({ data: [{ id: "queue-1", booking_id: "booking-1", processing_token: "token",
    email_payload: payload, phone: "+27000000000", wa_payload: wa, delivery_context: {} }], error: null })) };
  return { admin: admin as never, updates };
}

beforeEach(() => {
  vi.clearAllMocks();
  eligibility.mockResolvedValue({ allowed: true }); claim.mockResolvedValue(true);
  adminMock.mockReturnValue(null); persist.mockReset();
  providerSend.mockResolvedValue({ data: { id: "email-accepted" }, error: null });
  initialize.mockResolvedValue({ ok: true, bookingId: "booking-1", authorizationUrl: payload.paymentUrl, reference: "bps_test" });
  queueEmail.mockResolvedValue({ runAtIso: new Date(Date.now() + 1000).toISOString() }); scheduleRecovery.mockResolvedValue({ ok: true });
  email.mockResolvedValue({ sent: true }); abandonedEmail.mockResolvedValue({ sent: true }); sms.mockResolvedValue({ ok: true });
});

function cronAdmin(count = 1) {
  const chain = { select: () => chain, eq: () => chain, not: () => chain, gte: () => chain, lte: () => chain, order: () => chain,
    update: vi.fn(() => chain), limit: async () => ({ error: null, data: Array.from({ length: count }, (_, index) => ({ id: `booking-${index + 1}`, customer_email: payload.customerEmail,
      paystack_reference: "bps_test", payment_link: payload.paymentUrl, payment_link_expires_at: new Date(Date.now() + 60 * 60_000).toISOString(),
      total_price: 458, payment_link_send_count: 0 })) }) };
  return { from: () => chain };
}

describe("reminder cron claim lifetime", () => {
  const request = () => new Request("https://example.com/api/cron/payment-link-reminders", { method: "POST", headers: { authorization: "Bearer test" } });
  beforeEach(() => { vi.stubEnv("CRON_SECRET", "test"); adminMock.mockReturnValue(cronAdmin()); });
  it("leaves remaining candidates for the next invocation when its time budget is reached", async () => {
    vi.useFakeTimers();
    try {
      const started = Date.now(); adminMock.mockReturnValue(cronAdmin(2));
      email.mockImplementationOnce(async () => { vi.setSystemTime(started + 4 * 60_000 + 1); return { sent: true }; });
      const response = await runReminderCron(request());
      expect(await response.json()).toMatchObject({ deferredByBudget: 1 });
      expect(email).toHaveBeenCalledOnce(); expect(claim).toHaveBeenCalledOnce();
    } finally { vi.useRealTimers(); }
  });
  it("releases its claim after an exception before delivery", async () => {
    email.mockRejectedValueOnce(new Error("provider unavailable"));
    expect((await runReminderCron(request())).status).toBe(200);
    expect(release).toHaveBeenCalledWith(expect.anything(), "bps_test", "first");
  });
  it("retains its claim when persistence fails after accepted delivery", async () => {
    persist.mockRejectedValueOnce(new Error("database unavailable"));
    expect((await runReminderCron(request())).status).toBe(200);
    expect(email).toHaveBeenCalledOnce(); expect(release).not.toHaveBeenCalled();
  });
  it("retains its claim when delivery telemetry fails after provider acceptance", async () => {
    const { logSystemEvent } = await import("@/lib/logging/systemLog");
    vi.mocked(logSystemEvent).mockRejectedValueOnce(new Error("telemetry unavailable"));
    expect((await runReminderCron(request())).status).toBe(200);
    expect(email).toHaveBeenCalledOnce(); expect(release).not.toHaveBeenCalled();
  });
});

describe("actual payment message entry points", () => {
  it("suppresses both email and SMS in admin/reminder delivery when payment succeeded", async () => {
    eligibility.mockResolvedValue({ allowed: false, reason: "gateway_paid" });
    const result = await deliverAdminPaymentLink({ phone: "+27000000000", email: payload.customerEmail,
      emailPayload: payload, waPayload: wa, context: { stage: "reminder_1h" }, mode: "chain",
      supabaseAdmin: makeAdmin().admin, bookingId: "booking-1" });
    expect(result.fallbackTrace).toBe("payment_link_suppressed:gateway_paid");
    expect(email).not.toHaveBeenCalled(); expect(sms).not.toHaveBeenCalled();
    const actual = await vi.importActual<typeof import("@/lib/admin/persistPaymentLinkDelivery")>("@/lib/admin/persistPaymentLinkDelivery");
    const trackingAdmin = { from: vi.fn(), rpc: vi.fn() };
    await actual.persistPaymentLinkDelivery(trackingAdmin as never, "booking-1", result);
    expect(trackingAdmin.from).not.toHaveBeenCalled(); expect(trackingAdmin.rpc).not.toHaveBeenCalled();
  });
  it("rechecks before fallback SMS when payment succeeds during the failed email attempt", async () => {
    eligibility.mockResolvedValueOnce({ allowed: true }).mockResolvedValueOnce({ allowed: false, reason: "booking_paid" });
    email.mockResolvedValue({ sent: false, error: "temporary_email_failure" });
    await deliverAdminPaymentLink({ phone: "+27000000000", email: payload.customerEmail, emailPayload: payload,
      waPayload: wa, context: { stage: "reminder_1h" }, mode: "chain", supabaseAdmin: makeAdmin().admin, bookingId: "booking-1" });
    expect(email).toHaveBeenCalledOnce(); expect(sms).not.toHaveBeenCalled();
  });
  it("retires a queued payment email after payment, without SMS fallback", async () => {
    eligibility.mockResolvedValue({ allowed: false, reason: "booking_paid" });
    const { admin, updates } = makeAdmin();
    const result = await processDueDeferredPaymentLinkEmails(admin, { limit: 30 });
    expect((admin as unknown as { rpc: ReturnType<typeof vi.fn> }).rpc).toHaveBeenCalledWith("claim_due_deferred_payment_link_emails", expect.objectContaining({ p_limit: 5 }));
    expect(result).toMatchObject({ processed: 1, emailed: 0, smsFallback: 0, errors: 0 });
    expect(updates).toContainEqual(expect.objectContaining({ last_error: "suppressed:booking_paid", processing_token: null }));
    expect(email).not.toHaveBeenCalled(); expect(sms).not.toHaveBeenCalled();
  });
  it("suppresses abandoned-checkout recovery after payment", async () => {
    eligibility.mockResolvedValue({ allowed: false, reason: "gateway_paid" });
    const result = await processAbandonCheckoutReminders(makeAdmin().admin);
    expect(result.sent).toBe(0); expect(claim).not.toHaveBeenCalled();
    expect(abandonedEmail).not.toHaveBeenCalled(); expect(sms).not.toHaveBeenCalled();
  });
  it("uses the shared first-reminder claim and sends no SMS when email succeeds", async () => {
    await processAbandonCheckoutReminders(makeAdmin().admin);
    expect(claim).toHaveBeenCalledWith(expect.anything(), "booking-1", "bps_test", "first");
    expect(abandonedEmail).toHaveBeenCalledOnce(); expect(sms).not.toHaveBeenCalled();
  });
  it("keeps checkout recovery available before a gateway reference has been created", async () => {
    await processAbandonCheckoutReminders(makeAdmin(null).admin);
    expect(eligibility).toHaveBeenCalledWith(expect.anything(), "booking-1", "", { allowUninitialized: true });
    expect(claim).toHaveBeenCalledWith(expect.anything(), "booking-1", "checkout:booking-1", "first");
    expect(abandonedEmail).toHaveBeenCalledWith(expect.objectContaining({ checkoutUrl: expect.stringMatching(/\/book(?:\?|$)/) }));
  });
  it("does not send the abandoned email after another job wins the first-reminder claim", async () => {
    claim.mockResolvedValue(false);
    await processAbandonCheckoutReminders(makeAdmin().admin);
    expect(abandonedEmail).not.toHaveBeenCalled(); expect(sms).not.toHaveBeenCalled();
  });
  it("releases an abandoned reminder claim when the SMS eligibility recheck is transient", async () => {
    abandonedEmail.mockResolvedValue({ sent: false });
    eligibility.mockResolvedValueOnce({ allowed: true }).mockResolvedValueOnce({ allowed: true }).mockResolvedValueOnce({ allowed: false, reason: "gateway_unavailable", retryable: true });
    await processAbandonCheckoutReminders(makeAdmin().admin);
    expect(sms).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledWith(expect.anything(), "bps_test", "first");
  });
  it("suppresses abandonment delivery when payment settles during claim acquisition", async () => {
    eligibility.mockResolvedValueOnce({ allowed: true }).mockResolvedValueOnce({ allowed: false, reason: "booking_paid" });
    await processAbandonCheckoutReminders(makeAdmin().admin);
    expect(abandonedEmail).not.toHaveBeenCalled(); expect(sms).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledWith(expect.anything(), "bps_test", "first");
  });
  it("bounds abandonment verification work within its run budget", async () => {
    vi.useFakeTimers();
    try {
      const started = Date.now();
      abandonedEmail.mockImplementationOnce(async () => { vi.setSystemTime(started + 4 * 60_000 + 1); return { sent: true }; });
      expect(await processAbandonCheckoutReminders(makeAdmin("bps_test", 0, 2).admin)).toMatchObject({ sent: 1, skipped: 1 });
      expect(abandonedEmail).toHaveBeenCalledOnce();
    } finally { vi.useRealTimers(); }
  });
  it("releases an abandoned reminder claim after a provider exception", async () => {
    abandonedEmail.mockRejectedValueOnce(new Error("provider unavailable"));
    await processAbandonCheckoutReminders(makeAdmin().admin);
    expect(release).toHaveBeenCalledWith(expect.anything(), "bps_test", "first");
  });
  it("retains the abandoned reminder claim after accepted email and telemetry failure", async () => {
    const { logPipelineEmailTelemetry } = await import("@/lib/notifications/notificationEmailTelemetry");
    vi.mocked(logPipelineEmailTelemetry).mockRejectedValueOnce(new Error("telemetry unavailable"));
    await processAbandonCheckoutReminders(makeAdmin().admin);
    expect(release).not.toHaveBeenCalled();
    expect(sms).not.toHaveBeenCalled();
  });
  it("records provider acceptance before delivery telemetry can throw", async () => {
    const { logSystemEvent } = await import("@/lib/logging/systemLog");
    vi.mocked(logSystemEvent).mockRejectedValueOnce(new Error("telemetry unavailable"));
    const accepted = vi.fn();
    await expect(deliverAdminPaymentLink({ phone: null, email: payload.customerEmail, emailPayload: payload,
      waPayload: wa, context: { stage: "reminder_1h" }, mode: "chain", supabaseAdmin: makeAdmin().admin,
      bookingId: "booking-1", onDeliveryAccepted: accepted })).rejects.toThrow("telemetry unavailable");
    expect(accepted).toHaveBeenCalledOnce();
  });
  it.each(["payment_reminder_1h", "payment_reminder_24h", "booking_payment_expired"])(
    "suppresses legacy %s jobs before email or expiration when Paystack is paid", async (jobType) => {
      eligibility.mockResolvedValue({ allowed: false, reason: "gateway_paid" });
      const result = await processPaymentRecoveryJob(makeAdmin().admin, { id: "job-1", booking_id: "booking-1",
        job_type: jobType, customer_email: "customer@example.com", attempts: 0 });
      expect(result).toBe("skipped"); expect(recoveryEmail).not.toHaveBeenCalled(); expect(expire).not.toHaveBeenCalled();
    });
  it("lets a legacy reminder retry when a competing worker later releases its claim", async () => {
    const { buildPaymentRecoveryEmailContext } = await import("@/lib/email/paymentRecoveryEmails");
    vi.mocked(buildPaymentRecoveryEmailContext).mockReturnValue({ bookingId: "booking-1", to: payload.customerEmail,
      customerName: "Pat", serviceLabel: payload.serviceLabel, dateLabel: payload.dateLabel, timeLabel: payload.timeLabel,
      amountZar: 458, paymentUrl: payload.paymentUrl, paystackReference: "bps_test" });
    claim.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    recoveryEmail.mockRejectedValueOnce(new Error("temporary provider failure"));
    const { admin, updates } = makeAdmin();
    const job = { id: "job-1", booking_id: "booking-1", job_type: "payment_reminder_1h", customer_email: payload.customerEmail, attempts: 0 };
    expect(await processPaymentRecoveryJob(admin, job)).toBe("retry");
    expect(updates).toContainEqual(expect.objectContaining({ status: "failed_retryable", last_error: "automatic_reminder_claim_pending" }));
    expect(recoveryEmail).not.toHaveBeenCalled();
    await processPaymentRecoveryJob(admin, job);
    expect(recoveryEmail).toHaveBeenCalledOnce();
    expect(release).toHaveBeenCalledWith(admin, "bps_test", "first");
  });
  it("suppresses a legacy reminder after payment settles while its claim is acquired", async () => {
    const { buildPaymentRecoveryEmailContext } = await import("@/lib/email/paymentRecoveryEmails");
    vi.mocked(buildPaymentRecoveryEmailContext).mockReturnValue({ bookingId: "booking-1", to: payload.customerEmail,
      customerName: "Pat", serviceLabel: payload.serviceLabel, dateLabel: payload.dateLabel, timeLabel: payload.timeLabel,
      amountZar: 458, paymentUrl: payload.paymentUrl, paystackReference: "bps_test" });
    eligibility.mockResolvedValueOnce({ allowed: true }).mockResolvedValueOnce({ allowed: false, reason: "booking_paid" });
    expect(await processPaymentRecoveryJob(makeAdmin().admin, { id: "job-1", booking_id: "booking-1", job_type: "payment_reminder_1h",
      customer_email: payload.customerEmail, attempts: 0 })).toBe("skipped");
    expect(recoveryEmail).not.toHaveBeenCalled(); expect(release).toHaveBeenCalledWith(expect.anything(), "bps_test", "first");
  });
  it("allows expiry recovery to evaluate a booking that never received a gateway reference", async () => {
    expire.mockResolvedValueOnce({ ok: true, transitioned: true });
    recoveryEmail.mockResolvedValue({ sent: false, error: "email unavailable" });
    await processPaymentRecoveryJob(makeAdmin(null).admin, { id: "job-1", booking_id: "booking-1", job_type: "booking_payment_expired",
      customer_email: payload.customerEmail, attempts: 0 });
    expect(eligibility).toHaveBeenCalledWith(expect.anything(), "booking-1", "", { allowExpired: true, allowUninitialized: true });
    expect(expire).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ bookingId: "booking-1" }));
  });
  it("retries expiry beyond the email failure budget and resumes after gateway recovery", async () => {
    eligibility.mockResolvedValueOnce({ allowed: false, reason: "gateway_unavailable", retryable: true }).mockResolvedValue({ allowed: true });
    const { admin, updates } = makeAdmin("bps_test", 5);
    const job = { id: "job-1", booking_id: "booking-1", job_type: "booking_payment_expired", customer_email: payload.customerEmail, attempts: 5 };
    expect(await processPaymentRecoveryJob(admin, job)).toBe("retry");
    expect(updates).toContainEqual(expect.objectContaining({ status: "failed_retryable", attempts: 6, scheduled_for: expect.any(String) }));
    expect(expire).not.toHaveBeenCalled();
    expire.mockResolvedValueOnce({ ok: false, error: "temporary transition failure" }).mockResolvedValueOnce({ ok: true, transitioned: true });
    recoveryEmail.mockResolvedValue({ sent: false });
    expect(await processPaymentRecoveryJob(admin, job)).toBe("retry");
    expect(updates).toContainEqual(expect.objectContaining({ status: "failed_retryable", last_error: "temporary transition failure" }));
    await processPaymentRecoveryJob(admin, job);
    expect(expire).toHaveBeenCalledTimes(2);
  });
  it("retries an unverified deferred payment request without sending email or SMS", async () => {
    eligibility.mockResolvedValue({ allowed: false, reason: "gateway_unavailable", retryable: true });
    const { admin, updates } = makeAdmin();
    const result = await processDueDeferredPaymentLinkEmails(admin);
    expect(result.retriesScheduled).toBe(1);
    expect(updates).toContainEqual(expect.objectContaining({ last_error: "eligibility:gateway_unavailable", processing_token: null }));
    expect(email).not.toHaveBeenCalled(); expect(sms).not.toHaveBeenCalled();
  });
  it("retries a deferred request when the SMS eligibility recheck is transient", async () => {
    email.mockResolvedValue({ sent: false, error: "email_unavailable" });
    eligibility.mockResolvedValueOnce({ allowed: true }).mockResolvedValueOnce({ allowed: false, reason: "gateway_unavailable", retryable: true });
    const result = await processDueDeferredPaymentLinkEmails(makeAdmin().admin);
    expect(result.retriesScheduled).toBe(1);
    expect(sms).not.toHaveBeenCalled();
  });
});

describe("provider acceptance survives recovery-record failures", () => {
  it.each(["rejected promise", "returned database error"])("preserves accepted email after %s", async (failure) => {
    const insert = failure === "rejected promise" ? vi.fn().mockRejectedValue(new Error("database offline"))
      : vi.fn().mockResolvedValue({ error: { message: "database offline" } });
    adminMock.mockReturnValue({ from: () => ({ insert }) });
    const { safeResendSend } = await import("@/lib/email/safeResendSend");
    expect(await safeResendSend({ from: "office@example.com", to: "customer@example.com", subject: "Payment reminder", text: "Synthetic test" }))
      .toEqual({ data: { id: "email-accepted" }, error: null });
    expect(providerSend).toHaveBeenCalledOnce();
  });
  it.each(["notification_logs", "all"])("keeps actual customer delivery accepted after %s audit failure", async (failedTable) => {
    adminMock.mockReturnValue({ from: (table: string) => ({ insert: async () => {
      if (failedTable === "all" || failedTable === table) throw new Error("audit database offline");
      return { error: null };
    } }) });
    const { sendCustomerEmailWithDbTemplateFallback } = await import("@/lib/email/customerEmailFromTemplate");
    expect(await sendCustomerEmailWithDbTemplateFallback({ to: "customer@example.com", templateKey: "payment_link", data: {},
      logEventType: "payment_link_sent", buildLegacy: () => ({ subject: "Payment reminder", html: "Synthetic test" }) })).toEqual({ sent: true });
    expect(providerSend).toHaveBeenCalledOnce();
  });
});

describe("admin resend reflects actual delivery eligibility", () => {
  const request = () => new Request("https://example.com/api/admin/bookings/booking-1/resend-payment-link", {
    method: "POST", headers: { authorization: "Bearer test", "Content-Type": "application/json" }, body: "{}" });
  function setup() {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co"); vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-key");
    const chain = { select: vi.fn((_columns: string) => chain), eq: () => chain, maybeSingle: async () => ({ error: null, data: {
      id: "booking-1", customer_id: "customer-1", status: "pending_payment", payment_link: payload.paymentUrl,
      payment_link_expires_at: new Date(Date.now() + 60 * 60_000).toISOString(), paystack_reference: "bps_test",
      customer_email: payload.customerEmail, total_price: 458, payment_link_send_count: 0,
    } }) };
    adminMock.mockReturnValue({ from: () => chain });
    return chain;
  }
  it.each([{ reason: "gateway_paid", retryable: false, status: 409 }, { reason: "gateway_unavailable", retryable: true, status: 503 }])(
    "reports suppression as a non-success for $reason", async ({ reason, retryable, status }) => {
      setup(); eligibility.mockResolvedValue({ allowed: false, reason, retryable });
      const response = await runAdminResend(request(), { params: Promise.resolve({ id: "booking-1" }) });
      expect(response.status).toBe(status); expect(await response.json()).toMatchObject({ ok: false, reason });
      expect(email).not.toHaveBeenCalled(); expect(sms).not.toHaveBeenCalled(); expect(persist).not.toHaveBeenCalled();
    });
  it("still resends eligible links using the canonical customer ownership column", async () => {
    const chain = setup();
    const response = await runAdminResend(request(), { params: Promise.resolve({ id: "booking-1" }) });
    expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ ok: true, primary_channel: "email" });
    expect(chain.select.mock.calls[0][0]).toContain("customer_id");
    expect(email).toHaveBeenCalledOnce(); expect(persist).toHaveBeenCalledOnce();
    const { applySendDelayIfNeeded } = await import("@/lib/ai-autonomy/optimizeTiming");
    expect(applySendDelayIfNeeded).not.toHaveBeenCalled();
  });
});

describe("initial and recurring delivery outcomes", () => {
  const row = { id: "booking-1", customer_id: "customer-1", status: "pending_payment", customer_name: "Pat Customer",
    customer_email: payload.customerEmail, customer_phone: "+27000000000", total_price: 458,
    booking_snapshot: { locked: { service: "regular-cleaning", date: "2026-10-18", time: "09:00" } } };
  it.each([false, true])("reports actual provider acceptance as %s for reused checkout notifications", async (allowed) => {
    eligibility.mockResolvedValue(allowed ? { allowed: true } : { allowed: false, reason: "gateway_unavailable", retryable: true });
    const sent = await sendAdminPaystackDeliveryForRow(makeAdmin().admin, { row: row as unknown as AdminPaystackBookingHead,
      authorizationUrl: payload.paymentUrl, reference: "bps_test", notificationMode: "chain", locked: {} });
    expect(sent).toBe(allowed);
    if (!allowed) { expect(email).not.toHaveBeenCalled(); expect(persist).not.toHaveBeenCalled(); }
  });
  it.each([false, true])("marks recurring fallback only after durable queue acceptance: %s", async (queueOk) => {
    const updates: Record<string, unknown>[] = [];
    const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: row, error: null }),
      update: (patch: Record<string, unknown>) => { updates.push(patch); return chain; } };
    if (!queueOk) queueEmail.mockRejectedValueOnce(new Error("queue unavailable"));
    const queueLookup = { select: () => queueLookup, eq: () => queueLookup, limit: () => queueLookup, maybeSingle: async () => ({ data: null, error: null }) };
    expect(await runRecurringPaymentLinkFallback({ from: (table: string) => table === "bookings" ? chain : queueLookup } as never, "booking-1")).toBe(queueOk);
    expect(queueEmail).toHaveBeenCalledOnce(); expect(email).not.toHaveBeenCalled(); expect(sms).not.toHaveBeenCalled();
    expect(updates.some(patch => "recurring_fallback_at" in patch)).toBe(queueOk);
    if (queueOk) expect(persist).toHaveBeenCalledWith(expect.anything(), "booking-1", expect.objectContaining({ emailDeferredUntilIso: expect.any(String) }), expect.anything());
  });
  it("repairs a failed recurring marker without replacing queued work or initializing another reference", async () => {
    let queued = false; let markerFailures = 1; let patch: Record<string, unknown> = {};
    const booking = { select: () => booking, eq: () => booking, maybeSingle: async () => ({ data: row, error: null }),
      update: (next: Record<string, unknown>) => { patch = next; return booking; },
      then: (resolve: (value: unknown) => unknown) => resolve({ error: "recurring_fallback_at" in patch && markerFailures-- > 0 ? { message: "marker unavailable" } : null }) };
    const queueLookup = { select: () => queueLookup, eq: () => queueLookup, limit: () => queueLookup,
      maybeSingle: async () => ({ data: queued ? { id: "queued-1" } : null, error: null }) };
    queueEmail.mockImplementationOnce(async () => { queued = true; return { runAtIso: new Date().toISOString() }; });
    const admin = { from: (table: string) => table === "bookings" ? booking : queueLookup } as never;
    expect(await runRecurringPaymentLinkFallback(admin, "booking-1")).toBe(false);
    expect(await runRecurringPaymentLinkFallback(admin, "booking-1")).toBe(true);
    expect(queueEmail).toHaveBeenCalledOnce(); expect(initialize).toHaveBeenCalledOnce();
  });
});
