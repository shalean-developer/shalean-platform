import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  BOOKING_SELECT_FIELDS_FOR_WEEKLY_BATCH_ELIGIBILITY,
  bookingPayableForWeeklyBatch,
  type BookingRowForWeeklyBatchEligibility,
} from "@/lib/payout/bookingPayableForWeeklyBatch";
import { bookingUsesAccrualPayoutCap } from "@/lib/payout/bookingPayoutCapCents";
import {
  PHASE15A_ANOMALIES_DEFAULT_MAX_SCAN,
  PHASE15A_ANOMALY_CATEGORY_SLUGS,
  PHASE15A_CLASSIFICATIONS,
  type Phase15aAnomaliesReadModel,
  type Phase15aAnomalyCategorySlug,
  type Phase15aAnomalyRow,
  type Phase15aBurnInReadiness,
  type Phase15aClassification,
  type Phase15bPreGateReadiness,
} from "@/lib/payout/phase15aAnomaliesShared";
import {
  buildPhase15aClassificationContext,
  classifyPhase15aAnomaly,
} from "@/lib/payout/phase15aAnomalyClassification";

/**
 * Phase 15A Week 2–3 — read-only admin anomaly read model (+ Week 3 advisory classification).
 *
 * **Authority alignment:** rows in `claim_shadow`, `batch_authority`, and `transfer_authority` use
 * {@link bookingPayableForWeeklyBatch} only (same family as SQL **P8** / **P10** / **P11** / **P11b** in
 * `supabase/queries/audit_payout_subsystem_convergence_phase11.sql`). Do not reimplement that predicate
 * elsewhere — extend `bookingPayableForWeeklyBatch` or the SQL probes together.
 */

const BOOKING_FIELDS_FOR_PHASE15A =
  `${BOOKING_SELECT_FIELDS_FOR_WEEKLY_BATCH_ELIGIBILITY}, payout_id, payment_state`;

const DISCLAIMER =
  "Phase 15A measurement only. These findings do not block payouts yet.";

const CLASSIFICATION_ADVISORY =
  "Classification is advisory. Phase 15A still does not block payouts.";

type Phase15aCategoryBundle = {
  rows: Phase15aAnomalyRow[];
  count_is_lower_bound: boolean;
};

function normLower(s: string | null | undefined): string {
  return String(s ?? "")
    .trim()
    .toLowerCase();
}

function labelForSlug(slug: Phase15aAnomalyCategorySlug): string {
  switch (slug) {
    case "ledger_ahead":
      return "Ledger processing/paid while booking payout is not eligible/paid (P9)";
    case "authority_ahead":
      return "Booking payout eligible/paid while cleaner_earnings off-rail (P9b)";
    case "batched_claimable":
      return "Weekly batch linked (payout_id) but ledger still approved without disbursement (P9c)";
    case "claim_shadow":
      return "Claim-shaped cleaner_earnings failing booking weekly authority (P10)";
    case "batch_authority":
      return "cleaner_payouts paid+success but booking fails weekly authority (P11)";
    case "transfer_authority":
      return "payout_transfers success but booking fails weekly authority (P11b)";
    default:
      return slug;
  }
}

function classifiedRow(
  slug: Phase15aAnomalyCategorySlug,
  parts: Omit<
    Phase15aAnomalyRow,
    "category_slug" | "category_label" | "classification" | "classification_reason"
  >,
  booking?: Record<string, unknown> | null,
): Phase15aAnomalyRow {
  const partial = {
    category_slug: slug,
    category_label: labelForSlug(slug),
    ...parts,
  };
  const ctx = buildPhase15aClassificationContext(slug, partial, booking ?? undefined);
  const { classification, classification_reason } = classifyPhase15aAnomaly(ctx);
  return { ...partial, classification, classification_reason };
}

function emptyClassificationCounts(): Record<Phase15aClassification, number> {
  return Object.fromEntries(PHASE15A_CLASSIFICATIONS.map((c) => [c, 0])) as Record<
    Phase15aClassification,
    number
  >;
}

function emptyCategoryClassificationMatrix(): Record<
  Phase15aAnomalyCategorySlug,
  Record<Phase15aClassification, number>
> {
  const m = {} as Record<Phase15aAnomalyCategorySlug, Record<Phase15aClassification, number>>;
  for (const s of PHASE15A_ANOMALY_CATEGORY_SLUGS) {
    m[s] = emptyClassificationCounts();
  }
  return m;
}

function aggregateFromRows(rowsByCategory: Record<Phase15aAnomalyCategorySlug, Phase15aAnomalyRow[]>): {
  counts_by_classification: Record<Phase15aClassification, number>;
  counts_by_category_and_classification: Record<Phase15aAnomalyCategorySlug, Record<Phase15aClassification, number>>;
} {
  const counts_by_classification = emptyClassificationCounts();
  const counts_by_category_and_classification = emptyCategoryClassificationMatrix();
  for (const cat of PHASE15A_ANOMALY_CATEGORY_SLUGS) {
    for (const row of rowsByCategory[cat] ?? []) {
      counts_by_classification[row.classification] += 1;
      counts_by_category_and_classification[cat][row.classification] += 1;
    }
  }
  return { counts_by_classification, counts_by_category_and_classification };
}

function buildBurnInReadiness(
  counts_by_classification: Record<Phase15aClassification, number>,
  count_lower_bound_by_category: Record<Phase15aAnomalyCategorySlug, boolean>,
  rowsByCategory: Record<Phase15aAnomalyCategorySlug, Phase15aAnomalyRow[]>,
): Phase15aBurnInReadiness {
  const categories_suggested_for_phase15b_investigation = PHASE15A_ANOMALY_CATEGORY_SLUGS.filter(
    (c) => (rowsByCategory[c] ?? []).length > 0,
  );
  return {
    has_active_blocker_candidates: counts_by_classification.active_blocker_candidate > 0,
    has_refund_related_candidates: counts_by_classification.refund_related_candidate > 0,
    has_missing_relation_candidates: counts_by_classification.missing_relation_candidate > 0,
    counts_lower_bound_due_to_scan_cap: PHASE15A_ANOMALY_CATEGORY_SLUGS.some(
      (c) => count_lower_bound_by_category[c],
    ),
    categories_suggested_for_phase15b_investigation,
    advisory_note:
      "Advisory burn-in summary only. Use with SQL probes and shadow logs before enabling Phase 15B soft gates.",
  };
}

function buildPhase15bPreGateReadiness(burn: Phase15aBurnInReadiness, total: number): Phase15bPreGateReadiness {
  if (total === 0) {
    return { status: "review_ok", rationale: "No anomalies in the current scan window." };
  }
  if (
    burn.has_active_blocker_candidates &&
    burn.counts_lower_bound_due_to_scan_cap
  ) {
    return {
      status: "not_ready",
      rationale:
        "Active blocker-shaped anomalies present while scan cap may truncate counts; widen max_scan or wait for burn-in before Phase 15B.",
    };
  }
  if (burn.has_active_blocker_candidates || burn.has_refund_related_candidates) {
    return {
      status: "caution",
      rationale: "Active blocker and/or refund-related candidates require human review and probe correlation.",
    };
  }
  if (burn.has_missing_relation_candidates) {
    return {
      status: "caution",
      rationale: "Missing relation candidates suggest data integrity review before soft gates.",
    };
  }
  return {
    status: "review_ok",
    rationale: "Residual anomalies are legacy/terminology/manual-review weighted; still verify counts are not scan-truncated.",
  };
}

async function loadInvoiceMap(
  admin: SupabaseClient,
  bookingRows: BookingRowForWeeklyBatchEligibility[],
): Promise<Map<string, string>> {
  const ids = new Set<string>();
  for (const b of bookingRows) {
    if (bookingUsesAccrualPayoutCap(b)) {
      const mid = String(b.monthly_invoice_id ?? "").trim();
      if (mid) ids.add(mid);
    }
  }
  const map = new Map<string, string>();
  if (!ids.size) return map;
  const { data, error } = await admin.from("monthly_invoices").select("id, status").in("id", [...ids]);
  if (error) return map;
  for (const r of data ?? []) {
    const row = r as { id?: string; status?: string | null };
    if (typeof row.id === "string") map.set(row.id, String(row.status ?? ""));
  }
  return map;
}

/** Same decision as P10/P11/P11b inner predicate: `!bookingPayableForWeeklyBatch` (refund-aware in app). */
export function bookingFailsWeeklyAuthorityForPhase15a(
  booking: BookingRowForWeeklyBatchEligibility,
  invoiceStatusById: Map<string, string>,
): { fails: true; reason: string } | { fails: false } {
  const gate = bookingPayableForWeeklyBatch(booking, invoiceStatusById);
  return gate.payable ? { fails: false } : { fails: true, reason: gate.reason };
}

type EarningLite = {
  id: string;
  booking_id: string | null;
  cleaner_id: string | null;
  status: string | null;
  disbursement_id: string | null;
  updated_at?: string | null;
  created_at?: string | null;
};

async function fetchLedgerAhead(admin: SupabaseClient, maxScan: number): Promise<Phase15aCategoryBundle> {
  const { data: ceRows, error } = await admin
    .from("cleaner_earnings")
    .select("id, booking_id, cleaner_id, status, disbursement_id, updated_at")
    .in("status", ["processing", "paid"])
    .order("updated_at", { ascending: false })
    .limit(maxScan);
  if (error || !ceRows?.length) {
    return { rows: [], count_is_lower_bound: false };
  }
  const earnings = ceRows as EarningLite[];
  const bids = [...new Set(earnings.map((e) => String(e.booking_id ?? "").trim()).filter(Boolean))];
  const { data: bRows } = await admin.from("bookings").select(BOOKING_FIELDS_FOR_PHASE15A).in("id", bids);
  const byId = new Map((bRows as Record<string, unknown>[] | null)?.map((b) => [String(b.id), b]) ?? []);
  const out: Phase15aAnomalyRow[] = [];
  for (const ce of earnings) {
    const bid = String(ce.booking_id ?? "").trim();
    const b = byId.get(bid) as Record<string, unknown> | undefined;
    const ps = normLower(b?.payout_status as string | null);
    if (!b || ps === "eligible" || ps === "paid") continue;
    out.push(
      classifiedRow(
        "ledger_ahead",
        {
          booking_id: bid || null,
          cleaner_id: String(ce.cleaner_id ?? "").trim() || null,
          cleaner_earning_id: String(ce.id),
          payout_id: (b.payout_id as string | null) ?? null,
          cleaner_payout_id: null,
          payout_transfer_id: null,
          disbursement_id: (ce.disbursement_id as string | null) ?? null,
          payment_status: (b.payment_status as string | null) ?? null,
          payment_state: (b.payment_state as string | null) ?? null,
          payout_status: (b.payout_status as string | null) ?? null,
          cleaner_earnings_status: ce.status ?? null,
          reason: "cleaner_earnings_in_flight_or_paid_but_booking_payout_not_eligible_or_paid",
        },
        b as Record<string, unknown>,
      ),
    );
  }
  const hitCap = earnings.length >= maxScan;
  return { rows: out, count_is_lower_bound: hitCap };
}

async function fetchAuthorityAhead(admin: SupabaseClient, maxScan: number): Promise<Phase15aCategoryBundle> {
  const { data: bRows, error } = await admin
    .from("bookings")
    .select(BOOKING_FIELDS_FOR_PHASE15A)
    .or("payout_status.eq.eligible,payout_status.eq.paid")
    .order("updated_at", { ascending: false })
    .limit(maxScan);
  if (error || !bRows?.length) return { rows: [], count_is_lower_bound: false };
  const bookings = bRows as {
    id: string;
    payout_status?: string | null;
    payment_status?: string | null;
    payment_state?: string | null;
    payout_id?: string | null;
  }[];
  const bids = bookings.map((b) => b.id);
  const { data: ceRows } = await admin
    .from("cleaner_earnings")
    .select("id, booking_id, cleaner_id, status, disbursement_id")
    .in("booking_id", bids);
  const byBooking = new Map<string, EarningLite[]>();
  for (const r of (ceRows ?? []) as EarningLite[]) {
    const bid = String(r.booking_id ?? "").trim();
    if (!bid) continue;
    const arr = byBooking.get(bid) ?? [];
    arr.push(r);
    byBooking.set(bid, arr);
  }
  const allowed = new Set(["approved", "processing", "paid"]);
  const out: Phase15aAnomalyRow[] = [];
  for (const b of bookings) {
    const list = byBooking.get(b.id) ?? [];
    for (const ce of list) {
      const st = normLower(ce.status);
      if (allowed.has(st)) continue;
      out.push(
        classifiedRow(
          "authority_ahead",
          {
            booking_id: b.id,
            cleaner_id: String(ce.cleaner_id ?? "").trim() || null,
            cleaner_earning_id: String(ce.id),
            payout_id: b.payout_id ?? null,
            cleaner_payout_id: b.payout_id ?? null,
            payout_transfer_id: null,
            disbursement_id: ce.disbursement_id ?? null,
            payment_status: b.payment_status ?? null,
            payment_state: b.payment_state ?? null,
            payout_status: b.payout_status ?? null,
            cleaner_earnings_status: ce.status ?? null,
            reason: "booking_payout_eligible_or_paid_but_ledger_not_in_pipeline",
          },
          b as unknown as Record<string, unknown>,
        ),
      );
    }
  }
  const hitCap = bookings.length >= maxScan;
  return { rows: out, count_is_lower_bound: hitCap };
}

async function fetchBatchedClaimable(admin: SupabaseClient, maxScan: number): Promise<Phase15aCategoryBundle> {
  const { data: ceRows, error } = await admin
    .from("cleaner_earnings")
    .select("id, booking_id, cleaner_id, status, disbursement_id, updated_at")
    .eq("status", "approved")
    .is("disbursement_id", null)
    .order("updated_at", { ascending: false })
    .limit(maxScan);
  if (error || !ceRows?.length) return { rows: [], count_is_lower_bound: false };
  const earnings = ceRows as EarningLite[];
  const bids = [...new Set(earnings.map((e) => String(e.booking_id ?? "").trim()).filter(Boolean))];
  const { data: bRows } = await admin.from("bookings").select(BOOKING_FIELDS_FOR_PHASE15A).in("id", bids);
  const byId = new Map((bRows as Record<string, unknown>[] | null)?.map((b) => [String(b.id), b]) ?? []);
  const out: Phase15aAnomalyRow[] = [];
  for (const ce of earnings) {
    const bid = String(ce.booking_id ?? "").trim();
    const b = byId.get(bid) as Record<string, unknown> | undefined;
    const pid = b?.payout_id;
    if (!b || pid == null || String(pid).trim() === "") continue;
    out.push(
      classifiedRow(
        "batched_claimable",
        {
          booking_id: bid || null,
          cleaner_id: String(ce.cleaner_id ?? "").trim() || null,
          cleaner_earning_id: String(ce.id),
          payout_id: String(pid),
          cleaner_payout_id: String(pid),
          payout_transfer_id: null,
          disbursement_id: null,
          payment_status: (b.payment_status as string | null) ?? null,
          payment_state: (b.payment_state as string | null) ?? null,
          payout_status: (b.payout_status as string | null) ?? null,
          cleaner_earnings_status: ce.status ?? null,
          reason: "booking_in_weekly_batch_but_ledger_still_approved_without_disbursement",
        },
        b,
      ),
    );
  }
  const hitCap = earnings.length >= maxScan;
  return { rows: out, count_is_lower_bound: hitCap };
}

async function fetchClaimShadow(admin: SupabaseClient, maxScan: number): Promise<Phase15aCategoryBundle> {
  const { data: ceRows, error } = await admin
    .from("cleaner_earnings")
    .select("id, booking_id, cleaner_id, status, disbursement_id, created_at")
    .eq("status", "approved")
    .is("disbursement_id", null)
    .order("created_at", { ascending: false })
    .limit(maxScan);
  if (error || !ceRows?.length) return { rows: [], count_is_lower_bound: false };
  const earnings = ceRows as EarningLite[];
  const bids = [...new Set(earnings.map((e) => String(e.booking_id ?? "").trim()).filter(Boolean))];
  const { data: bRows } = await admin.from("bookings").select(BOOKING_FIELDS_FOR_PHASE15A).in("id", bids);
  const byId = new Map(
    (bRows as BookingRowForWeeklyBatchEligibility[] | null)?.map((b) => [String(b.id), b]) ?? [],
  );
  const invMap = await loadInvoiceMap(admin, [...byId.values()]);
  const out: Phase15aAnomalyRow[] = [];
  for (const ce of earnings) {
    const bid = String(ce.booking_id ?? "").trim();
    const b = byId.get(bid);
    if (!b || b.is_test === true) continue;
    const gate = bookingFailsWeeklyAuthorityForPhase15a(b, invMap);
    if (!gate.fails) continue;
    out.push(
      classifiedRow(
        "claim_shadow",
        {
          booking_id: bid || null,
          cleaner_id: String(ce.cleaner_id ?? "").trim() || null,
          cleaner_earning_id: String(ce.id),
          payout_id: (b.payout_id as string | null) ?? null,
          cleaner_payout_id: (b.payout_id as string | null) ?? null,
          payout_transfer_id: null,
          disbursement_id: null,
          payment_status: b.payment_status ?? null,
          payment_state: (b as { payment_state?: string | null }).payment_state ?? null,
          payout_status: b.payout_status ?? null,
          cleaner_earnings_status: ce.status ?? null,
          reason: gate.reason,
        },
        b as unknown as Record<string, unknown>,
      ),
    );
  }
  const hitCap = earnings.length >= maxScan;
  return { rows: out, count_is_lower_bound: hitCap };
}

async function fetchBatchAuthority(admin: SupabaseClient, maxScan: number): Promise<Phase15aCategoryBundle> {
  const { data: cpRows, error } = await admin
    .from("cleaner_payouts")
    .select("id, status, payment_status, paid_at")
    .eq("status", "paid")
    .eq("payment_status", "success")
    .order("paid_at", { ascending: false, nullsFirst: false })
    .limit(maxScan);
  if (error || !cpRows?.length) return { rows: [], count_is_lower_bound: false };
  const cpList = cpRows as { id: string }[];
  const pids = cpList.map((c) => c.id);
  const { data: bRows } = await admin.from("bookings").select(BOOKING_FIELDS_FOR_PHASE15A).in("payout_id", pids);
  const bookings = (bRows ?? []) as (BookingRowForWeeklyBatchEligibility & { payment_state?: string | null })[];
  const invMap = await loadInvoiceMap(admin, bookings);
  const out: Phase15aAnomalyRow[] = [];
  for (const b of bookings) {
    if (b.is_test === true) continue;
    const gate = bookingFailsWeeklyAuthorityForPhase15a(b, invMap);
    if (!gate.fails) continue;
    const pid = String(b.payout_id ?? "").trim();
    out.push(
      classifiedRow(
        "batch_authority",
        {
          booking_id: String(b.id),
          cleaner_id: String(b.cleaner_id ?? "").trim() || null,
          cleaner_earning_id: null,
          payout_id: pid || null,
          cleaner_payout_id: pid || null,
          payout_transfer_id: null,
          disbursement_id: null,
          payment_status: b.payment_status ?? null,
          payment_state: b.payment_state ?? null,
          payout_status: b.payout_status ?? null,
          cleaner_earnings_status: null,
          reason: gate.reason,
        },
        b as unknown as Record<string, unknown>,
      ),
    );
  }
  const hitCap = cpList.length >= maxScan;
  return { rows: out, count_is_lower_bound: hitCap };
}

async function fetchTransferAuthority(admin: SupabaseClient, maxScan: number): Promise<Phase15aCategoryBundle> {
  const { data: ptRows, error } = await admin
    .from("payout_transfers")
    .select("id, payout_id, status, created_at")
    .eq("status", "success")
    .order("created_at", { ascending: false })
    .limit(maxScan);
  if (error || !ptRows?.length) return { rows: [], count_is_lower_bound: false };
  const transfers = ptRows as { id: string; payout_id: string }[];
  const payoutIds = [...new Set(transfers.map((t) => String(t.payout_id ?? "").trim()).filter(Boolean))];
  const { data: bRows } = await admin.from("bookings").select(BOOKING_FIELDS_FOR_PHASE15A).in("payout_id", payoutIds);
  const bookings = (bRows ?? []) as (BookingRowForWeeklyBatchEligibility & { payment_state?: string | null })[];
  const invMap = await loadInvoiceMap(admin, bookings);
  const byPayout = new Map<string, typeof transfers>();
  for (const t of transfers) {
    const pid = String(t.payout_id ?? "").trim();
    const arr = byPayout.get(pid) ?? [];
    arr.push(t);
    byPayout.set(pid, arr);
  }
  const out: Phase15aAnomalyRow[] = [];
  for (const b of bookings) {
    if (b.is_test === true) continue;
    const gate = bookingFailsWeeklyAuthorityForPhase15a(b, invMap);
    if (!gate.fails) continue;
    const pid = String(b.payout_id ?? "").trim();
    const pt = (byPayout.get(pid) ?? [])[0];
    out.push(
      classifiedRow(
        "transfer_authority",
        {
          booking_id: String(b.id),
          cleaner_id: String(b.cleaner_id ?? "").trim() || null,
          cleaner_earning_id: null,
          payout_id: pid || null,
          cleaner_payout_id: pid || null,
          payout_transfer_id: pt?.id ?? null,
          disbursement_id: null,
          payment_status: b.payment_status ?? null,
          payment_state: b.payment_state ?? null,
          payout_status: b.payout_status ?? null,
          cleaner_earnings_status: null,
          reason: gate.reason,
        },
        b as unknown as Record<string, unknown>,
      ),
    );
  }
  const hitCap = transfers.length >= maxScan;
  return { rows: out, count_is_lower_bound: hitCap };
}

export type FetchPhase15aAnomaliesParams = {
  /** Max rows returned per category. */
  limit: number;
  /** Max source rows scanned per category (counts may be lower bounds when true). */
  maxScan: number;
  /** When set, only fetch this category. */
  category?: Phase15aAnomalyCategorySlug | null;
  /** When set, only include rows with this classification (counts reflect filtered set; burn-in uses full scan). */
  classification?: Phase15aClassification | null;
};

export async function fetchPhase15aPayoutAnomalies(
  admin: SupabaseClient,
  params: FetchPhase15aAnomaliesParams,
): Promise<Phase15aAnomaliesReadModel> {
  const limit = Math.min(200, Math.max(1, Math.floor(params.limit)));
  const maxScan = Math.min(PHASE15A_ANOMALIES_DEFAULT_MAX_SCAN, Math.max(limit, Math.floor(params.maxScan)));
  const cat = params.category ?? null;
  const classificationFilter = params.classification ?? null;

  const run = async (slug: Phase15aAnomalyCategorySlug): Promise<Phase15aCategoryBundle> => {
    switch (slug) {
      case "ledger_ahead":
        return fetchLedgerAhead(admin, maxScan);
      case "authority_ahead":
        return fetchAuthorityAhead(admin, maxScan);
      case "batched_claimable":
        return fetchBatchedClaimable(admin, maxScan);
      case "claim_shadow":
        return fetchClaimShadow(admin, maxScan);
      case "batch_authority":
        return fetchBatchAuthority(admin, maxScan);
      case "transfer_authority":
        return fetchTransferAuthority(admin, maxScan);
      default:
        return { rows: [], count_is_lower_bound: false };
    }
  };

  const slugs = cat ? [cat] : [...PHASE15A_ANOMALY_CATEGORY_SLUGS];
  const bundles = await Promise.all(slugs.map((s) => run(s)));
  const full_rows_by_category = {} as Record<Phase15aAnomalyCategorySlug, Phase15aAnomalyRow[]>;
  const count_lower_bound_by_category = {} as Record<Phase15aAnomalyCategorySlug, boolean>;
  for (let i = 0; i < slugs.length; i++) {
    const s = slugs[i]!;
    const b = bundles[i]!;
    full_rows_by_category[s] = b.rows;
    count_lower_bound_by_category[s] = b.count_is_lower_bound;
  }

  if (cat) {
    for (const s of PHASE15A_ANOMALY_CATEGORY_SLUGS) {
      if (s === cat) continue;
      full_rows_by_category[s] = [];
      count_lower_bound_by_category[s] = false;
    }
  }

  const aggFull = aggregateFromRows(full_rows_by_category);
  const burn_in_readiness = buildBurnInReadiness(
    aggFull.counts_by_classification,
    count_lower_bound_by_category,
    full_rows_by_category,
  );
  const total_full = PHASE15A_ANOMALY_CATEGORY_SLUGS.reduce(
    (acc, s) => acc + (full_rows_by_category[s]?.length ?? 0),
    0,
  );
  const phase15b_pre_gate_readiness = buildPhase15bPreGateReadiness(burn_in_readiness, total_full);

  const filterRows = (rows: Phase15aAnomalyRow[]) => {
    let r = rows;
    if (classificationFilter) r = r.filter((x) => x.classification === classificationFilter);
    return r.slice(0, limit);
  };

  const rows_by_category = {} as Record<Phase15aAnomalyCategorySlug, Phase15aAnomalyRow[]>;
  const filtered_full = {} as Record<Phase15aAnomalyCategorySlug, Phase15aAnomalyRow[]>;
  for (const s of PHASE15A_ANOMALY_CATEGORY_SLUGS) {
    const all = full_rows_by_category[s] ?? [];
    filtered_full[s] = classificationFilter ? all.filter((x) => x.classification === classificationFilter) : all;
    rows_by_category[s] = filterRows(all);
  }

  const counts_by_category = {} as Record<Phase15aAnomalyCategorySlug, number>;
  for (const s of PHASE15A_ANOMALY_CATEGORY_SLUGS) {
    counts_by_category[s] = filtered_full[s]?.length ?? 0;
  }

  const aggFiltered = aggregateFromRows(filtered_full);
  const total_anomaly_count = PHASE15A_ANOMALY_CATEGORY_SLUGS.reduce(
    (acc, s) => acc + (filtered_full[s]?.length ?? 0),
    0,
  );

  return {
    measurement_only: true,
    disclaimer: DISCLAIMER,
    limit,
    max_scan: maxScan,
    total_anomaly_count,
    counts_by_category,
    count_lower_bound_by_category,
    rows_by_category,
    classification_advisory_note: CLASSIFICATION_ADVISORY,
    counts_by_classification: aggFiltered.counts_by_classification,
    counts_by_category_and_classification: aggFiltered.counts_by_category_and_classification,
    burn_in_readiness,
    phase15b_pre_gate_readiness,
    classification_filter_applied: classificationFilter,
  };
}
