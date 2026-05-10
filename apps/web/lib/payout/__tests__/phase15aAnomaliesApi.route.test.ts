import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Phase15aAnomaliesReadModel } from "@/lib/payout/phase15aAnomaliesShared";
import {
  PHASE15A_ANOMALIES_DEFAULT_MAX_SCAN,
  PHASE15A_ANOMALY_CATEGORY_SLUGS,
  PHASE15A_CLASSIFICATIONS,
  type Phase15aAnomalyCategorySlug,
  type Phase15aClassification,
} from "@/lib/payout/phase15aAnomaliesShared";

const fetchPhase15aPayoutAnomalies = vi.fn();

vi.mock("@/lib/auth/requireAdminApi", () => ({
  requireAdminApi: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: vi.fn(),
}));

vi.mock("@/lib/payout/phase15aAnomaliesReadModel", () => ({
  fetchPhase15aPayoutAnomalies: (...args: unknown[]) => fetchPhase15aPayoutAnomalies(...args),
}));

import { GET } from "@/app/api/admin/payouts/phase15a-anomalies/route";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";

function emptyModel(over: Partial<Phase15aAnomaliesReadModel> = {}): Phase15aAnomaliesReadModel {
  const counts_by_category = Object.fromEntries(PHASE15A_ANOMALY_CATEGORY_SLUGS.map((s) => [s, 0])) as Record<
    Phase15aAnomalyCategorySlug,
    number
  >;
  const count_lower_bound_by_category = Object.fromEntries(
    PHASE15A_ANOMALY_CATEGORY_SLUGS.map((s) => [s, false]),
  ) as Record<Phase15aAnomalyCategorySlug, boolean>;
  const rows_by_category = Object.fromEntries(PHASE15A_ANOMALY_CATEGORY_SLUGS.map((s) => [s, []])) as unknown as Record<
    Phase15aAnomalyCategorySlug,
    Phase15aAnomaliesReadModel["rows_by_category"][Phase15aAnomalyCategorySlug]
  >;
  const counts_by_classification = Object.fromEntries(
    PHASE15A_CLASSIFICATIONS.map((c) => [c, 0]),
  ) as Record<Phase15aClassification, number>;
  const counts_by_category_and_classification = {} as Record<
    Phase15aAnomalyCategorySlug,
    Record<Phase15aClassification, number>
  >;
  for (const cat of PHASE15A_ANOMALY_CATEGORY_SLUGS) {
    counts_by_category_and_classification[cat] = { ...counts_by_classification };
  }
  return {
    measurement_only: true,
    disclaimer: "Phase 15A measurement only. These findings do not block payouts yet.",
    limit: 40,
    max_scan: PHASE15A_ANOMALIES_DEFAULT_MAX_SCAN,
    total_anomaly_count: 0,
    counts_by_category,
    count_lower_bound_by_category,
    rows_by_category,
    classification_advisory_note: "Classification is advisory. Phase 15A still does not block payouts.",
    counts_by_classification,
    counts_by_category_and_classification,
    burn_in_readiness: {
      has_active_blocker_candidates: false,
      has_refund_related_candidates: false,
      has_missing_relation_candidates: false,
      counts_lower_bound_due_to_scan_cap: false,
      categories_suggested_for_phase15b_investigation: [],
      advisory_note: "burn-in",
    },
    phase15b_pre_gate_readiness: {
      status: "review_ok",
      rationale: "test",
    },
    classification_filter_applied: null,
    ...over,
  };
}

describe("GET /api/admin/payouts/phase15a-anomalies", () => {
  beforeEach(() => {
    fetchPhase15aPayoutAnomalies.mockReset();
    vi.mocked(requireAdminApi).mockReset();
    vi.mocked(getSupabaseAdmin).mockReset();
  });

  it("returns 401 when authorization is missing", async () => {
    vi.mocked(requireAdminApi).mockResolvedValue({ ok: false, status: 401, error: "Missing authorization." });
    const res = await GET(new Request("http://localhost/api/admin/payouts/phase15a-anomalies"));
    expect(res.status).toBe(401);
    expect(fetchPhase15aPayoutAnomalies).not.toHaveBeenCalled();
  });

  it("returns 403 when user is not admin", async () => {
    vi.mocked(requireAdminApi).mockResolvedValue({ ok: false, status: 403, error: "Forbidden." });
    const res = await GET(
      new Request("http://localhost/api/admin/payouts/phase15a-anomalies", {
        headers: { Authorization: "Bearer token" },
      }),
    );
    expect(res.status).toBe(403);
    expect(fetchPhase15aPayoutAnomalies).not.toHaveBeenCalled();
  });

  it("returns JSON read model with Week 3 classification fields (backward compatible)", async () => {
    vi.mocked(requireAdminApi).mockResolvedValue({ ok: true, userId: "u1", email: "a@example.com" });
    vi.mocked(getSupabaseAdmin).mockReturnValue({ from: vi.fn(() => ({ select: vi.fn() })) } as never);
    const base = emptyModel();
    const payload = emptyModel({
      total_anomaly_count: 3,
      counts_by_category: { ...base.counts_by_category, claim_shadow: 3 },
      counts_by_classification: { ...base.counts_by_classification, active_blocker_candidate: 3 },
    });
    fetchPhase15aPayoutAnomalies.mockResolvedValue(payload);

    const res = await GET(
      new Request("http://localhost/api/admin/payouts/phase15a-anomalies", {
        headers: { Authorization: "Bearer token" },
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as Phase15aAnomaliesReadModel;
    expect(json.measurement_only).toBe(true);
    expect(json.total_anomaly_count).toBe(3);
    expect(json.counts_by_category.claim_shadow).toBe(3);
    expect(json.counts_by_classification.active_blocker_candidate).toBe(3);
    expect(json.burn_in_readiness).toBeDefined();
    expect(json.phase15b_pre_gate_readiness.status).toBeDefined();
    expect(json.classification_filter_applied).toBeNull();
    expect(json.rows_by_category).toBeDefined();
    expect(fetchPhase15aPayoutAnomalies).toHaveBeenCalledTimes(1);
    const arg1 = fetchPhase15aPayoutAnomalies.mock.calls[0]?.[1] as {
      limit: number;
      maxScan: number;
      category: unknown;
      classification: unknown;
    };
    expect(arg1.limit).toBe(40);
    expect(arg1.maxScan).toBe(PHASE15A_ANOMALIES_DEFAULT_MAX_SCAN);
    expect(arg1.category).toBeNull();
    expect(arg1.classification).toBeNull();
  });

  it("passes category filter to the read model", async () => {
    vi.mocked(requireAdminApi).mockResolvedValue({ ok: true, userId: "u1", email: "a@example.com" });
    vi.mocked(getSupabaseAdmin).mockReturnValue({} as never);
    fetchPhase15aPayoutAnomalies.mockResolvedValue(emptyModel());

    await GET(
      new Request("http://localhost/api/admin/payouts/phase15a-anomalies?category=claim_shadow", {
        headers: { Authorization: "Bearer token" },
      }),
    );
    const arg = fetchPhase15aPayoutAnomalies.mock.calls[0]?.[1] as { category: Phase15aAnomalyCategorySlug | null };
    expect(arg.category).toBe("claim_shadow");
  });

  it("passes classification filter to the read model", async () => {
    vi.mocked(requireAdminApi).mockResolvedValue({ ok: true, userId: "u1", email: "a@example.com" });
    vi.mocked(getSupabaseAdmin).mockReturnValue({} as never);
    fetchPhase15aPayoutAnomalies.mockResolvedValue(emptyModel());

    await GET(
      new Request("http://localhost/api/admin/payouts/phase15a-anomalies?classification=legacy_drift_candidate", {
        headers: { Authorization: "Bearer token" },
      }),
    );
    const arg = fetchPhase15aPayoutAnomalies.mock.calls[0]?.[1] as {
      classification: Phase15aClassification | null;
    };
    expect(arg.classification).toBe("legacy_drift_candidate");
  });

  it("passes limit and max_scan to the read model", async () => {
    vi.mocked(requireAdminApi).mockResolvedValue({ ok: true, userId: "u1", email: "a@example.com" });
    vi.mocked(getSupabaseAdmin).mockReturnValue({} as never);
    fetchPhase15aPayoutAnomalies.mockResolvedValue(emptyModel());

    await GET(
      new Request("http://localhost/api/admin/payouts/phase15a-anomalies?limit=12&max_scan=500", {
        headers: { Authorization: "Bearer token" },
      }),
    );
    const arg = fetchPhase15aPayoutAnomalies.mock.calls[0]?.[1] as { limit: number; maxScan: number };
    expect(arg.limit).toBe(12);
    expect(arg.maxScan).toBe(500);
  });
});
