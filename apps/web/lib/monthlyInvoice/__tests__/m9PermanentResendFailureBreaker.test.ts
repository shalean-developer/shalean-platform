import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  reportOperationalIssueMock,
  logSystemEventMock,
  sendMonthlyInvoiceEmailMock,
  sendMonthlyInvoiceReminderEmailMock,
  sendViaMetaWhatsAppMock,
  initializePaystackMock,
  buildSnapshotMock,
  wrapSnapshotMock,
  appendSnapshotEventMock,
  invoicePaymentLinkEmailSentExistsMock,
  todayJhbMock,
  isInvoiceMonthReadyMock,
} = vi.hoisted(() => ({
  reportOperationalIssueMock: vi.fn().mockResolvedValue(undefined),
  logSystemEventMock: vi.fn().mockResolvedValue(undefined),
  sendMonthlyInvoiceEmailMock: vi.fn(),
  sendMonthlyInvoiceReminderEmailMock: vi.fn(),
  sendViaMetaWhatsAppMock: vi.fn(),
  initializePaystackMock: vi.fn(),
  buildSnapshotMock: vi.fn(),
  wrapSnapshotMock: vi.fn(),
  appendSnapshotEventMock: vi.fn(),
  invoicePaymentLinkEmailSentExistsMock: vi.fn(),
  todayJhbMock: vi.fn(),
  isInvoiceMonthReadyMock: vi.fn(),
}));

vi.mock("@/lib/logging/systemLog", () => ({
  reportOperationalIssue: reportOperationalIssueMock,
  logSystemEvent: logSystemEventMock,
}));

vi.mock("@/lib/monthlyInvoice/sendMonthlyInvoiceEmail", () => ({
  sendMonthlyInvoiceEmail: sendMonthlyInvoiceEmailMock,
  sendMonthlyInvoiceReminderEmail: sendMonthlyInvoiceReminderEmailMock,
}));

vi.mock("@/lib/dispatch/metaWhatsAppSend", () => ({
  sendViaMetaWhatsApp: sendViaMetaWhatsAppMock,
}));

vi.mock("@/lib/monthlyInvoice/initializePaystackForMonthlyInvoice", () => ({
  initializePaystackForMonthlyInvoice: initializePaystackMock,
}));

vi.mock("@/lib/monthlyInvoice/buildMonthlyInvoiceSnapshot", () => ({
  buildMonthlyInvoiceSnapshot: buildSnapshotMock,
  wrapSnapshotCurrentV1: wrapSnapshotMock,
}));

vi.mock("@/lib/monthlyInvoice/invoiceSnapshotEvents", () => ({
  appendMonthlyInvoiceSnapshotEvent: appendSnapshotEventMock,
  invoicePaymentLinkEmailSentExists: invoicePaymentLinkEmailSentExistsMock,
}));

vi.mock("@/lib/recurring/johannesburgCalendar", () => ({
  todayJohannesburg: todayJhbMock,
  isInvoiceMonthReadyToFinalize: isInvoiceMonthReadyMock,
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => buildAdminClient(),
}));

vi.mock("@/lib/cleaner/resolveCleanerEarnings", () => ({
  resolveCleanerFrozenCentsForSettlement: () => 24500,
}));

vi.mock("@/lib/monthlyInvoice/allocateMonthlyChildPaymentCents", () => ({
  allocateMonthlyChildPaymentCents: () => 12345,
}));

vi.mock("@/lib/dashboard/invoiceOverdueEscalation", () => ({
  daysPastDueJhb: (_due: string, _now: Date) => 3,
}));

vi.mock("@/lib/dashboard/bookingSlotTimes", () => ({
  johannesburgTodayYmd: (_now: Date) => "2030-04-04",
}));

vi.mock("@/lib/admin/invoices/invoiceAdminFormatters", () => ({
  formatMonthLongYearUtc: (m: string) => `MONTH(${m})`,
  formatDueDateLabel: (d: string | null) => `DUE(${d ?? ""})`,
}));

vi.mock("@/lib/notifications/customerPhoneNormalize", () => ({
  customerPhoneToE164: (s: string) => s,
}));

vi.mock("@/lib/utils/phone", () => ({
  normalizeSouthAfricaPhone: () => null,
}));

import { finalizeDueMonthlyInvoices } from "@/lib/monthlyInvoice/finalizeDueMonthlyInvoices";
import { runSendInvoiceReminders } from "@/lib/monthlyInvoice/runSendInvoiceReminders";

type AnyRecord = Record<string, unknown>;

type CapturedUpdate = { table: string; patch: AnyRecord; predicates: Array<[string, unknown]> };
type CapturedInsert = { table: string; row: AnyRecord };

let captured: {
  updates: CapturedUpdate[];
  inserts: CapturedInsert[];
  rpcCalls: { name: string; args: AnyRecord }[];
} = { updates: [], inserts: [], rpcCalls: [] };

let invoiceRowsForFinalize: AnyRecord[] = [];
let invoiceRowsForReminders: AnyRecord[] = [];
let usersById = new Map<string, { id: string; email: string; phone?: string }>();

/**
 * Tiny chainable Supabase-style builder. The production code under test uses
 * deep chains (.from().select().eq().eq().maybeSingle(), .from().update().eq()
 * .eq().select(), etc.). Rather than hand-mock every individual chain we
 * accumulate predicates and let the terminal method (maybeSingle / awaited
 * promise / select) consult the backing data via the routing function.
 */
type RouteContext = {
  table: string;
  op: "select" | "update" | "insert" | null;
  patch: AnyRecord;
  predicates: Array<[string, unknown]>;
  selectOpts: { count?: string; head?: boolean };
};

function makeChain(ctx: RouteContext, route: (ctx: RouteContext) => { data: unknown; error: unknown }): AnyRecord {
  const eqLike = (col: string, val: unknown) => {
    ctx.predicates.push([col, val]);
    return chain;
  };
  const chain: AnyRecord = {
    select: (_cols: string, opts?: { count?: string; head?: boolean }) => {
      ctx.op = ctx.op ?? "select";
      if (opts) ctx.selectOpts = opts;
      return chain;
    },
    eq: eqLike,
    in: eqLike,
    gt: eqLike,
    lt: eqLike,
    gte: eqLike,
    lte: eqLike,
    neq: eqLike,
    is: eqLike,
    maybeSingle: async () => {
      const r = route({ ...ctx });
      const data = Array.isArray(r.data) ? (r.data[0] ?? null) : r.data;
      return { data, error: r.error };
    },
    single: async () => {
      const r = route({ ...ctx });
      const data = Array.isArray(r.data) ? (r.data[0] ?? null) : r.data;
      return { data, error: r.error };
    },
    then: (resolve: (v: { data: unknown; error: unknown }) => void) => {
      const r = route({ ...ctx });
      if (ctx.op === "update" || ctx.op === "insert") {
        captured.updates.push({ table: ctx.table, patch: ctx.patch, predicates: ctx.predicates });
      }
      resolve(r);
    },
  };
  return chain;
}

function buildAdminClient(): AnyRecord {
  function route(ctx: RouteContext): { data: unknown; error: unknown } {
    const findById = (rows: AnyRecord[]) => {
      const idPred = ctx.predicates.find(([c]) => c === "id");
      if (!idPred) return null;
      return rows.find((r) => r.id === idPred[1]) ?? null;
    };

    if (ctx.table === "monthly_invoices") {
      if (ctx.op === "select") {
        const idMatch = findById(invoiceRowsForFinalize);
        if (idMatch) return { data: idMatch, error: null };

        const statusPred = ctx.predicates.find(([c]) => c === "status");
        if (statusPred && String(statusPred[1]) === "draft") {
          return { data: invoiceRowsForFinalize, error: null };
        }

        if (invoiceRowsForReminders.length > 0) {
          return { data: invoiceRowsForReminders, error: null };
        }
        return { data: [], error: null };
      }
      if (ctx.op === "update") {
        return { data: [{ id: "ok" }], error: null };
      }
    }
    if (ctx.table === "monthly_invoice_events") {
      return { data: [], error: null };
    }
    if (ctx.table === "bookings") {
      if (ctx.op === "select" && ctx.selectOpts.head) return { data: null, error: null };
      return { data: [], error: null };
    }
    return { data: null, error: null };
  }

  return {
    from(table: string) {
      const ctx: RouteContext = {
        table,
        op: null,
        patch: {},
        predicates: [],
        selectOpts: {},
      };
      return {
        select: (cols: string, opts?: { count?: string; head?: boolean }) => {
          ctx.op = "select";
          if (opts) ctx.selectOpts = opts;
          void cols;
          return makeChain(ctx, route);
        },
        update: (patch: AnyRecord) => {
          ctx.op = "update";
          ctx.patch = patch;
          return makeChain(ctx, route);
        },
        insert: (row: AnyRecord) => {
          captured.inserts.push({ table, row });
          return {
            then: (resolve: (v: { error: null }) => void) => resolve({ error: null }),
            select: () => ({
              single: async () => ({ data: { id: "x" }, error: null }),
              maybeSingle: async () => ({ data: { id: "x" }, error: null }),
            }),
          };
        },
      };
    },
    rpc: (name: string, args: AnyRecord) => {
      captured.rpcCalls.push({ name, args });
      return {
        then: (resolve: (v: { error: null }) => void) => resolve({ error: null }),
      };
    },
    auth: {
      admin: {
        getUserById: async (id: string) => {
          const u = usersById.get(id);
          if (!u) return { data: { user: null }, error: null };
          return { data: { user: u }, error: null };
        },
      },
    },
  };
}

beforeEach(() => {
  reportOperationalIssueMock.mockReset();
  logSystemEventMock.mockReset();
  sendMonthlyInvoiceEmailMock.mockReset();
  sendMonthlyInvoiceReminderEmailMock.mockReset();
  sendViaMetaWhatsAppMock.mockReset();
  initializePaystackMock.mockReset();
  buildSnapshotMock.mockReset();
  wrapSnapshotMock.mockReset();
  appendSnapshotEventMock.mockReset();
  invoicePaymentLinkEmailSentExistsMock.mockReset();
  todayJhbMock.mockReset();
  isInvoiceMonthReadyMock.mockReset();

  captured = { updates: [], inserts: [], rpcCalls: [] };
  invoiceRowsForFinalize = [];
  invoiceRowsForReminders = [];
  usersById = new Map();

  todayJhbMock.mockReturnValue("2030-04-30");
  isInvoiceMonthReadyMock.mockReturnValue(true);
  buildSnapshotMock.mockResolvedValue({ totals: { total_bookings: 1 } });
  wrapSnapshotMock.mockReturnValue({ v: 1 });
  appendSnapshotEventMock.mockResolvedValue({ ok: true });
  invoicePaymentLinkEmailSentExistsMock.mockResolvedValue(false);
  initializePaystackMock.mockResolvedValue({
    ok: true,
    authorizationUrl: "https://paystack.test/pay/abc",
    reference: "mi_inv_abc",
  });
  sendViaMetaWhatsAppMock.mockResolvedValue({ ok: true, messageId: "wa_1" });
});

afterEach(() => {
  vi.clearAllMocks();
});

/* ------------------------------------------------------------------- */
/* runSendInvoiceReminders — the main retry-churn target                */
/* ------------------------------------------------------------------- */

describe("runSendInvoiceReminders — M-9 breaker behavior", () => {
  function seedReminderInvoices(count: number) {
    invoiceRowsForReminders = Array.from({ length: count }).map((_, i) => ({
      id: `inv_${i}`,
      customer_id: `cust_${i}`,
      month: "2030-03",
      due_date: "2030-04-01",
      payment_link: `https://paystack.test/pay/${i}`,
      balance_cents: 50_000,
      total_amount_cents: 50_000,
      amount_paid_cents: 0,
      status: "sent",
      is_closed: false,
    }));
    for (let i = 0; i < count; i++) {
      usersById.set(`cust_${i}`, { id: `cust_${i}`, email: `customer${i}@example.com` });
    }
  }

  it("valid config: every eligible invoice gets a real send call (no breaker, no skips)", async () => {
    seedReminderInvoices(5);
    sendMonthlyInvoiceReminderEmailMock.mockResolvedValue({ sent: true, classification: "ok" });

    const admin = buildAdminClient();
    const result = await runSendInvoiceReminders(admin as unknown as Parameters<typeof runSendInvoiceReminders>[0]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.total_sent).toBe(5);
    expect(result.total_failed).toBe(0);
    expect(sendMonthlyInvoiceReminderEmailMock).toHaveBeenCalledTimes(5);
    expect(reportOperationalIssueMock).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      "notification_config_breaker_tripped",
      expect.anything(),
    );
  });

  it("transient failure: every invoice STILL gets attempted; no breaker trip; counted as failed", async () => {
    seedReminderInvoices(5);
    sendMonthlyInvoiceReminderEmailMock.mockResolvedValue({
      sent: false,
      classification: "transient",
      error: "fetch failed",
    });

    const admin = buildAdminClient();
    const result = await runSendInvoiceReminders(admin as unknown as Parameters<typeof runSendInvoiceReminders>[0]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.total_sent).toBe(0);
    expect(result.total_failed).toBe(5);
    expect(sendMonthlyInvoiceReminderEmailMock).toHaveBeenCalledTimes(5);
    expect(reportOperationalIssueMock).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      "notification_config_breaker_tripped",
      expect.anything(),
    );
  });

  it("permanent_config: only the FIRST invoice is attempted; remaining N-1 are skipped (M-9 fix)", async () => {
    seedReminderInvoices(5);
    sendMonthlyInvoiceReminderEmailMock.mockResolvedValue({
      sent: false,
      classification: "permanent_config",
      error: "RESEND_API_KEY not set",
    });

    const admin = buildAdminClient();
    const result = await runSendInvoiceReminders(admin as unknown as Parameters<typeof runSendInvoiceReminders>[0]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(sendMonthlyInvoiceReminderEmailMock).toHaveBeenCalledTimes(1);

    expect(result.total_failed).toBe(5);
    expect(result.by_channel.email.failed).toBe(5);

    expect(reportOperationalIssueMock).toHaveBeenCalledWith(
      "error",
      "cron/send-invoice-reminders",
      "notification_config_breaker_tripped",
      expect.objectContaining({
        channel: "email",
        first_invoice_id: "inv_0",
      }),
    );
    const tripCalls = reportOperationalIssueMock.mock.calls.filter(
      (c) => c[2] === "notification_config_breaker_tripped",
    );
    expect(tripCalls).toHaveLength(1);
  });

  it("permanent_config: WhatsApp channel is NOT gated by the email breaker", async () => {
    seedReminderInvoices(3);
    for (let i = 0; i < 3; i++) {
      const u = usersById.get(`cust_${i}`)!;
      usersById.set(`cust_${i}`, { ...u, phone: "+27821234567" });
    }
    sendMonthlyInvoiceReminderEmailMock.mockResolvedValue({
      sent: false,
      classification: "permanent_config",
      error: "RESEND_API_KEY not set",
    });
    sendViaMetaWhatsAppMock.mockResolvedValue({ ok: true, messageId: "wa_xyz" });

    const admin = buildAdminClient();
    const result = await runSendInvoiceReminders(admin as unknown as Parameters<typeof runSendInvoiceReminders>[0]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(sendMonthlyInvoiceReminderEmailMock).toHaveBeenCalledTimes(1);
    expect(sendViaMetaWhatsAppMock).toHaveBeenCalledTimes(3);
    expect(result.by_channel.whatsapp.sent).toBe(3);
  });

  it("permanent_config audit trail: every skipped invoice still gets a per-invoice failed event", async () => {
    seedReminderInvoices(4);
    sendMonthlyInvoiceReminderEmailMock.mockResolvedValue({
      sent: false,
      classification: "permanent_config",
      error: "RESEND_API_KEY not set",
    });

    const admin = buildAdminClient();
    await runSendInvoiceReminders(admin as unknown as Parameters<typeof runSendInvoiceReminders>[0]);

    const reminderEventCalls = appendSnapshotEventMock.mock.calls.filter((c) => {
      const ev = c[2] as AnyRecord | undefined;
      return ev?.kind === "invoice_reminder_sent" && (ev as { channel?: string }).channel === "email";
    });
    expect(reminderEventCalls).toHaveLength(4);
    const failedReminderEvents = reminderEventCalls.filter(
      (c) => (c[2] as AnyRecord).delivery_status === "failed",
    );
    expect(failedReminderEvents).toHaveLength(4);
  });

  it("permanent_validation does NOT trip the breaker (per-recipient bad input)", async () => {
    seedReminderInvoices(3);
    sendMonthlyInvoiceReminderEmailMock.mockResolvedValue({
      sent: false,
      classification: "permanent_validation",
      error: "to is invalid.",
    });

    const admin = buildAdminClient();
    const result = await runSendInvoiceReminders(admin as unknown as Parameters<typeof runSendInvoiceReminders>[0]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(sendMonthlyInvoiceReminderEmailMock).toHaveBeenCalledTimes(3);
    expect(reportOperationalIssueMock).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      "notification_config_breaker_tripped",
      expect.anything(),
    );
  });
});

/* ------------------------------------------------------------------- */
/* finalizeDueMonthlyInvoices — settlement preservation                 */
/* ------------------------------------------------------------------- */

describe("finalizeDueMonthlyInvoices — M-9 breaker preserves settlement", () => {
  function seedFinalizeInvoices(count: number) {
    invoiceRowsForFinalize = Array.from({ length: count }).map((_, i) => ({
      id: `inv_${i}`,
      customer_id: `cust_${i}`,
      month: "2030-03",
      due_date: "2030-04-30",
      status: "draft",
      total_amount_cents: 50_000,
    }));
    for (let i = 0; i < count; i++) {
      usersById.set(`cust_${i}`, { id: `cust_${i}`, email: `customer${i}@example.com` });
    }
  }

  it("permanent_config: Paystack init runs for ALL invoices; only email sends are skipped (settlement preserved)", async () => {
    seedFinalizeInvoices(4);
    sendMonthlyInvoiceEmailMock.mockResolvedValue({
      sent: false,
      classification: "permanent_config",
      error: "RESEND_API_KEY not set",
    });

    invoicePaymentLinkEmailSentExistsMock.mockResolvedValue(false);

    const admin = buildAdminClient();
    void admin;
    const result = await finalizeDueMonthlyInvoices();

    expect(result.ok).toBe(true);

    expect(initializePaystackMock).toHaveBeenCalledTimes(4);

    expect(sendMonthlyInvoiceEmailMock).toHaveBeenCalledTimes(1);

    expect(reportOperationalIssueMock).toHaveBeenCalledWith(
      "error",
      "cron/finalize-monthly-invoices",
      "notification_config_breaker_tripped",
      expect.objectContaining({ channel: "email" }),
    );
    const trips = reportOperationalIssueMock.mock.calls.filter(
      (c) => c[2] === "notification_config_breaker_tripped",
    );
    expect(trips).toHaveLength(1);
  });

  it("transient failure: each invoice still gets a real attempt (transient = retry on next cron tick)", async () => {
    seedFinalizeInvoices(3);
    sendMonthlyInvoiceEmailMock.mockResolvedValue({
      sent: false,
      classification: "transient",
      error: "fetch failed",
    });

    const result = await finalizeDueMonthlyInvoices();
    expect(result.ok).toBe(true);
    expect(initializePaystackMock).toHaveBeenCalledTimes(3);
    expect(sendMonthlyInvoiceEmailMock).toHaveBeenCalledTimes(3);
    const trips = reportOperationalIssueMock.mock.calls.filter(
      (c) => c[2] === "notification_config_breaker_tripped",
    );
    expect(trips).toHaveLength(0);
  });

  it("valid config: finalized count matches invoice count; no errors recorded", async () => {
    seedFinalizeInvoices(2);
    sendMonthlyInvoiceEmailMock.mockResolvedValue({ sent: true, classification: "ok" });

    const result = await finalizeDueMonthlyInvoices();
    expect(result.ok).toBe(true);
    expect(result.finalized).toBe(2);
    expect(result.errors).toBeUndefined();
    expect(sendMonthlyInvoiceEmailMock).toHaveBeenCalledTimes(2);
    expect(initializePaystackMock).toHaveBeenCalledTimes(2);
  });
});

/* ------------------------------------------------------------------- */
/* Source-level contract tests                                          */
/* ------------------------------------------------------------------- */

describe("M-9 source contracts", () => {
  it("sendMonthlyInvoiceEmail returns classification on every code path", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(__dirname, "..", "sendMonthlyInvoiceEmail.ts");
    const src = fs.readFileSync(file, "utf8");

    expect(src).toMatch(/SendMonthlyInvoiceEmailResult/);
    expect(src).toMatch(/classification:\s*"ok"/);
    expect(src).toMatch(/classification:\s*classifyMissingResendConfig/);
    const classifyCalls = src.match(/classifyResendSendError\s*\(/g) ?? [];
    expect(classifyCalls.length).toBeGreaterThanOrEqual(2);
  });

  it("finalizeDueMonthlyInvoices imports the breaker AND consults shouldSkipRemainingSends BEFORE claiming or sending", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(__dirname, "..", "finalizeDueMonthlyInvoices.ts");
    const src = fs.readFileSync(file, "utf8");

    expect(src).toMatch(/createNotificationConfigBreaker/);

    const skipIdx = src.indexOf("emailBreaker.shouldSkipRemainingSends");
    const claimIdx = src.indexOf("initial_invoice_email_dispatch_claimed: true");
    const sendIdx = src.indexOf("sendMonthlyInvoiceEmail(");
    expect(skipIdx).toBeGreaterThan(-1);
    expect(claimIdx).toBeGreaterThan(skipIdx);
    expect(sendIdx).toBeGreaterThan(skipIdx);
  });

  it("runSendInvoiceReminders consults shouldSkipRemainingSends before the email send call", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(__dirname, "..", "runSendInvoiceReminders.ts");
    const src = fs.readFileSync(file, "utf8");

    expect(src).toMatch(/createNotificationConfigBreaker/);

    const skipIdx = src.indexOf("emailBreaker.shouldSkipRemainingSends");
    const sendIdx = src.indexOf("sendMonthlyInvoiceReminderEmail(");
    expect(skipIdx).toBeGreaterThan(-1);
    expect(sendIdx).toBeGreaterThan(skipIdx);
  });

  it("WhatsApp send path is NOT gated by the email breaker", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(__dirname, "..", "runSendInvoiceReminders.ts");
    const src = fs.readFileSync(file, "utf8");

    const waBlock = src.split("// --- WhatsApp ---")[1] ?? "";
    expect(waBlock).not.toMatch(/emailBreaker\.shouldSkipRemainingSends/);
    expect(waBlock).toMatch(/sendViaMetaWhatsApp/);
  });
});
