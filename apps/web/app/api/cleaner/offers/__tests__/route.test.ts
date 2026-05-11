import { beforeEach, describe, expect, it, vi } from "vitest";

const CLEANER_ID = "d8a75570-4b3f-44bc-848a-ad9f33857c91";
const BOOKING_ID = "13cacd49-1d92-4e20-8d06-4f561d144bd8";
const OFFER_ID = "8dab7ec1-104b-4b81-a9d7-7362e8678fb2";

let nextOffersData: Array<Record<string, unknown>> = [];
let nextBookingsData: Array<Record<string, unknown>> = [];

const dispatchOffersChain = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  gt: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  limit: vi.fn(() => Promise.resolve({ data: nextOffersData, error: null })),
};

/** Captures the system_logs writes triggered by the route. */
type SystemLogPayload = { source?: string; level?: string; message?: string; context?: Record<string, unknown> };
const systemLogsInsert = vi.fn(async (payload: SystemLogPayload) => {
  void payload;
  return { error: null };
});
/** Captures fallback `.eq().maybeSingle()` reads from the preview helper. */
const previewBookingFetch = vi.fn(async () => ({ data: null, error: null }));
/**
 * Direct mock for the canonical preview helper so we can drive the
 * fallback branch without standing up the entire persist pipeline.
 *
 * The route now consumes the diagnostic variant
 * (`previewDisplayEarningsCentsForCleanerJobDiagnostic`) which returns
 * `{ ok, amountCents, source, missingReason }`. By default we resolve to
 * the "cleaner not eligible" miss so the unavailable / data-integrity branch
 * is exercised.
 */
type PreviewDiagnostic =
  | { ok: true; amountCents: number; source: "persist_engine"; missingReason: null }
  | { ok: false; amountCents: null; source: null; missingReason: string };
const previewEarningsCentsMock = vi.fn(async (): Promise<PreviewDiagnostic> => ({
  ok: false,
  amountCents: null,
  source: null,
  missingReason: "cleaner_not_eligible_for_preview",
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({
    from: (t: string) => {
      if (t === "dispatch_offers") return dispatchOffersChain;
      if (t === "bookings") {
        return {
          /** `.in()` (offers list lookup) and `.eq().maybeSingle()` (preview) shapes. */
          select: () => ({
            in: () => Promise.resolve({ data: nextBookingsData, error: null }),
            eq: () => ({
              maybeSingle: previewBookingFetch,
            }),
          }),
        };
      }
      if (t === "booking_cleaners") {
        return {
          select: () => ({
            eq: () => ({
              in: () => Promise.resolve({ data: [], error: null }),
            }),
          }),
        };
      }
      if (t === "system_logs") {
        return { insert: systemLogsInsert };
      }
      return dispatchOffersChain;
    },
  }),
}));

vi.mock("@/lib/cleaner/session", () => ({
  resolveCleanerIdFromRequest: async () => ({ cleanerId: CLEANER_ID, status: 200 }),
}));

vi.mock("@/lib/payout/persistCleanerPayout", () => ({
  previewDisplayEarningsCentsForCleanerJob: async (...args: unknown[]) => {
    const r = await previewEarningsCentsMock(...(args as []));
    return r.ok ? r.amountCents : null;
  },
  previewDisplayEarningsCentsForCleanerJobDiagnostic: (...args: unknown[]) =>
    previewEarningsCentsMock(...(args as [])),
  PREVIEW_EARNINGS_MISS: {
    BOOKING_NOT_FOUND: "booking_not_found",
    CLEANER_NOT_ELIGIBLE: "cleaner_not_eligible_for_preview",
    COMPUTE_FAILED: "earnings_compute_failed",
    TEAM_MISSING_TEAM_ID: "team_missing_team_id",
    TEAM_MEMBER_NOT_ALLOCATED: "team_member_not_allocated",
  },
}));

import { GET } from "../route";

function pendingOfferRow(over: Record<string, unknown> = {}) {
  return {
    id: OFFER_ID,
    booking_id: BOOKING_ID,
    cleaner_id: CLEANER_ID,
    status: "pending",
    expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
    created_at: new Date().toISOString(),
    ux_variant: null,
    dispatch_tier: null,
    dispatch_visible_at: null, // ← selected-cleaner checkout default
    dispatch_tier_window_end_at: null,
    offer_token: "11111111-2222-4333-8444-555555555555",
    sms_sent_at: null, // ← SMS failed (Authenticate)
    ...over,
  };
}

describe("GET /api/cleaner/offers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    nextOffersData = [];
    nextBookingsData = [];
    /** Default preview helper returns "no resolvable earnings" so the
     * unavailable / data-integrity branch is exercised by default. Tests
     * can override per-case. */
    previewBookingFetch.mockImplementation(async () => ({ data: null, error: null }));
    previewEarningsCentsMock.mockImplementation(async () => ({
      ok: false,
      amountCents: null,
      source: null,
      missingReason: "cleaner_not_eligible_for_preview",
    }));
  });

  it("filters active offers with expires_at > now", async () => {
    const res = await GET(new Request("http://localhost/api/cleaner/offers"));
    expect(res.status).toBe(200);
    expect(dispatchOffersChain.gt).toHaveBeenCalledWith("expires_at", expect.any(String));
    const [, iso] = dispatchOffersChain.gt.mock.calls[0] as [string, string];
    expect(Number.isNaN(Date.parse(iso))).toBe(false);
  });

  it("returns the pending offer even when SMS failed (sms_sent_at=null) and visible_at is null", async () => {
    nextOffersData = [pendingOfferRow()];
    nextBookingsData = [
      {
        id: BOOKING_ID,
        service: "Standard cleaning",
        date: "2026-05-15",
        time: "10:00",
        location: "343 Foo St, Cape Town",
        status: "pending_assignment",
        cleaner_id: null,
      },
    ];

    const res = await GET(new Request("http://localhost/api/cleaner/offers"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { offers: Array<{ id: string; sms_sent_at: string | null }> };
    expect(body.offers).toHaveLength(1);
    expect(body.offers[0]!.id).toBe(OFFER_ID);
    expect(body.offers[0]!.sms_sent_at).toBeNull();
  });

  it("hides a pending offer when the booking is already assigned to this cleaner (stale duplicate)", async () => {
    nextOffersData = [pendingOfferRow()];
    nextBookingsData = [
      {
        id: BOOKING_ID,
        status: "assigned",
        cleaner_id: CLEANER_ID,
      },
    ];

    const res = await GET(new Request("http://localhost/api/cleaner/offers"));
    const body = (await res.json()) as { offers: unknown[] };
    expect(body.offers).toHaveLength(0);
  });

  it("hides offers gated by dispatch_visible_at in the future", async () => {
    nextOffersData = [
      pendingOfferRow({
        dispatch_visible_at: new Date(Date.now() + 5 * 60_000).toISOString(),
      }),
    ];
    nextBookingsData = [{ id: BOOKING_ID, status: "pending_assignment", cleaner_id: null }];

    const res = await GET(new Request("http://localhost/api/cleaner/offers"));
    const body = (await res.json()) as { offers: unknown[] };
    expect(body.offers).toHaveLength(0);
  });

  describe("jobEarning payload contract", () => {
    it("emits jobEarning derived from the booking display_earnings_cents (no preview needed)", async () => {
      nextOffersData = [pendingOfferRow()];
      nextBookingsData = [
        {
          id: BOOKING_ID,
          service: "Standard cleaning",
          date: "2026-05-15",
          time: "10:00",
          location: "343 Foo St, Cape Town",
          status: "pending_assignment",
          cleaner_id: null,
          display_earnings_cents: 40000,
        },
      ];

      const res = await GET(new Request("http://localhost/api/cleaner/offers"));
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        offers: Array<{
          id: string;
          jobEarning: { amount_cents: number | null; currency: string; label: string };
        }>;
      };
      expect(body.offers).toHaveLength(1);
      expect(body.offers[0]!.jobEarning).toEqual({
        amount_cents: 40000,
        currency: "ZAR",
        label: "Job earning",
      });
      // No preview call when persisted earning resolves directly.
      expect(previewBookingFetch).not.toHaveBeenCalled();
    });

    it("prefers cleaner_earnings_total_cents over display_earnings_cents (line-ledger truth wins)", async () => {
      nextOffersData = [pendingOfferRow()];
      nextBookingsData = [
        {
          id: BOOKING_ID,
          status: "assigned",
          cleaner_id: null,
          display_earnings_cents: 30000,
          cleaner_earnings_total_cents: 50000,
        },
      ];

      const res = await GET(new Request("http://localhost/api/cleaner/offers"));
      const body = (await res.json()) as {
        offers: Array<{ jobEarning: { amount_cents: number } }>;
      };
      expect(body.offers[0]!.jobEarning.amount_cents).toBe(50000);
    });

    it("prefers the dispatch_offers snapshot before calling the runtime preview helper", async () => {
      /** Snapshot persisted at offer creation should bypass preview entirely — this is the bug-fix tier (4) in the offers route. */
      nextOffersData = [
        pendingOfferRow({
          display_earnings_cents: 42000,
          earnings_snapshot_source: "canonical",
        }),
      ];
      nextBookingsData = [
        {
          id: BOOKING_ID,
          status: "pending_assignment",
          cleaner_id: null,
          // ← no persisted booking earnings
        },
      ];
      previewEarningsCentsMock.mockImplementation(async () => ({
        ok: true,
        amountCents: 99999,
        source: "persist_engine",
        missingReason: null,
      }));

      const res = await GET(new Request("http://localhost/api/cleaner/offers"));
      const body = (await res.json()) as {
        offers: Array<{ jobEarning: { amount_cents: number | null } }>;
      };
      expect(body.offers[0]!.jobEarning.amount_cents).toBe(42000);
      /** Critical: the snapshot won, so the expensive runtime preview was NOT called. */
      expect(previewEarningsCentsMock).not.toHaveBeenCalled();
    });

    it("falls back to the canonical preview helper when neither booking nor snapshot has earnings", async () => {
      /** Legacy offer rows created before migration 20260934 lack the snapshot column. The runtime preview is the safety net. */
      nextOffersData = [pendingOfferRow({ display_earnings_cents: null })];
      nextBookingsData = [
        {
          id: BOOKING_ID,
          status: "pending_assignment",
          cleaner_id: null,
          // ← no display_earnings_cents / cleaner_earnings_total_cents / payout_frozen_cents
        },
      ];
      previewEarningsCentsMock.mockImplementation(async () => ({
        ok: true,
        amountCents: 60000,
        source: "persist_engine",
        missingReason: null,
      }));

      const res = await GET(new Request("http://localhost/api/cleaner/offers"));
      const body = (await res.json()) as {
        offers: Array<{ jobEarning: { amount_cents: number | null; currency: string; label: string } }>;
      };
      expect(previewEarningsCentsMock).toHaveBeenCalledTimes(1);
      expect(body.offers[0]!.jobEarning).toEqual({
        amount_cents: 60000,
        currency: "ZAR",
        label: "Job earning",
      });
      // Preview succeeded → no data-integrity warning.
      const integrityWarn = (systemLogsInsert.mock.calls ?? []).some(
        (c) => (c?.[0] as { source?: string } | undefined)?.source === "cleaner_offer_job_earning_unavailable",
      );
      expect(integrityWarn).toBe(false);
    });

    it("renders unavailable + logs a data-integrity warning when no source-of-truth resolves", async () => {
      nextOffersData = [pendingOfferRow()];
      nextBookingsData = [
        {
          id: BOOKING_ID,
          status: "pending_assignment",
          cleaner_id: null,
          // No persisted earnings at all → preview returns null (default mock).
        },
      ];

      const res = await GET(new Request("http://localhost/api/cleaner/offers"));
      const body = (await res.json()) as {
        offers: Array<{
          id: string;
          jobEarning: { amount_cents: number | null; currency: string; label: string };
        }>;
      };
      expect(body.offers).toHaveLength(1);
      expect(body.offers[0]!.jobEarning).toEqual({
        amount_cents: null,
        currency: "ZAR",
        label: "Job earning",
      });
      // Data-integrity warning fired so observability flags missing earnings.
      expect(systemLogsInsert).toHaveBeenCalled();
      const unavailableLog = (systemLogsInsert.mock.calls ?? [])
        .map((c) => (c?.[0] as { source?: string; level?: string; context?: Record<string, unknown> } | undefined))
        .find((c) => c?.source === "cleaner_offer_job_earning_unavailable");
      expect(unavailableLog).toBeDefined();
      expect(unavailableLog?.level).toBe("warn");
      /** Structured diagnostic must include the stable miss reason from the diagnostic preview helper. */
      expect(unavailableLog?.context).toMatchObject({
        finalJobEarning: null,
        unavailableReason: "cleaner_not_eligible_for_preview",
        fallbackUsed: true,
      });
    });
  });
});
