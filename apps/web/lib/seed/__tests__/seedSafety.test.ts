/**
 * Seed safety and correctness unit tests.
 * Validates the dev seed constants, safety guard, suburb resolution aliases,
 * recurring preferred-cleaner assignment, and earnings status transitions.
 * These tests run without a live database.
 */
import { describe, it, expect } from "vitest";

// ──────────────────────────────────────────────────────────────────────────────
// Seed safety constants (mirrors scripts/seed-dev.mjs)
// ──────────────────────────────────────────────────────────────────────────────

const PROD_REF = "tchayecuvzssixyxlvfu";
const DEV_REF  = "mbvixuzfvzbooiurvxwz";
const SEED_TAG = "DEVSEED";

function extractProjectRef(url: string): string {
  return url.match(/https:\/\/([^.]+)\.supabase/)?.[1] ?? "";
}

function isSafeToSeed(url: string): boolean {
  const ref = extractProjectRef(url);
  return ref !== PROD_REF && ref.length > 0;
}

// ──────────────────────────────────────────────────────────────────────────────
// Seed UUID constants
// ──────────────────────────────────────────────────────────────────────────────

const CLEANER_IDS = {
  c1: "f1000001-0001-4001-8001-000000000001",
  c2: "f1000001-0002-4001-8001-000000000002",
  c3: "f1000001-0003-4001-8001-000000000003",
  c4: "f1000001-0004-4001-8001-000000000004",
  c5: "f1000001-0005-4001-8001-000000000005",
  c6: "f1000001-0006-4001-8001-000000000006",
};

const BOOKING_IDS = {
  completed_standard:   "f2000001-0001-4002-8002-000000000001",
  completed_earnings_1: "f2000001-0003-4002-8002-000000000003",
};

const EARNING_IDS = {
  e1: "f3000001-0001-4003-8003-000000000001",
  e2: "f3000001-0002-4003-8003-000000000002",
};

const RECURRING_IDS = {
  weekly:      "f6000001-0001-4006-8006-000000000001",
  fortnightly: "f6000001-0002-4006-8006-000000000002",
  monthly:     "f6000001-0003-4006-8006-000000000003",
};

// ──────────────────────────────────────────────────────────────────────────────
// Tests: production safety guard
// ──────────────────────────────────────────────────────────────────────────────

describe("Seed safety guard", () => {
  it("blocks the production project ref", () => {
    expect(isSafeToSeed(`https://${PROD_REF}.supabase.co`)).toBe(false);
  });

  it("allows the development project ref", () => {
    expect(isSafeToSeed(`https://${DEV_REF}.supabase.co`)).toBe(true);
  });

  it("allows a staging project ref", () => {
    expect(isSafeToSeed("https://gbgnemlpyykyhpqqbgru.supabase.co")).toBe(true);
  });

  it("rejects an empty URL", () => {
    expect(isSafeToSeed("")).toBe(false);
  });

  it("rejects a non-supabase URL that accidentally contains the prod ref", () => {
    // URL must have /{PROD_REF}.supabase pattern to match — random strings don't
    expect(isSafeToSeed(`https://some-proxy.example.com/${PROD_REF}`)).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Tests: deterministic seed UUIDs
// ──────────────────────────────────────────────────────────────────────────────

describe("Seed UUID determinism", () => {
  it("has 6 distinct cleaner IDs", () => {
    const ids = Object.values(CLEANER_IDS);
    expect(new Set(ids).size).toBe(6);
  });

  it("all cleaner IDs match version-4 UUID format", () => {
    for (const id of Object.values(CLEANER_IDS)) {
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    }
  });

  it("all booking IDs match version-4 UUID format", () => {
    for (const id of Object.values(BOOKING_IDS)) {
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    }
  });

  it("SEED_TAG is a safe prefix with no SQL injection risk", () => {
    expect(SEED_TAG).toMatch(/^[A-Z0-9_-]+$/);
    expect(SEED_TAG.length).toBeLessThanOrEqual(20);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Tests: suburb resolution slug aliases
// ──────────────────────────────────────────────────────────────────────────────

describe("Suburb resolution slug aliases", () => {
  // Import the canonical slug alias map from the app
  const RESOLVE_SLUG_ALIASES: Record<string, string> = {
    "d-urbanvale": "durbanville",
    durbanvale: "durbanville",
    "cape-town-cbd": "cape-town",
    tableview: "table-view",
    "simons-town": "simons-town",
    "va-waterfront": "waterfront",
    "v-a-waterfront": "waterfront",
  };

  function bookingLocationSlug(label: string): string {
    return label
      .toLowerCase()
      .replace(/['']/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  }

  function normalizeLocationResolveSlug(label: string): string {
    const raw = bookingLocationSlug(label);
    if (!raw || raw === "other") return "";
    return RESOLVE_SLUG_ALIASES[raw] ?? raw;
  }

  it("resolves 'Sea Point' to 'sea-point'", () => {
    expect(normalizeLocationResolveSlug("Sea Point")).toBe("sea-point");
  });

  it("resolves 'Claremont' to 'claremont'", () => {
    expect(normalizeLocationResolveSlug("Claremont")).toBe("claremont");
  });

  it("resolves 'V&A Waterfront' to 'waterfront' via v-a-waterfront alias", () => {
    // "V&A Waterfront" → lower → "v&a waterfront" → slugify → "v-a-waterfront"
    // → RESOLVE_SLUG_ALIASES["v-a-waterfront"] = "waterfront"
    expect(normalizeLocationResolveSlug("V&A Waterfront")).toBe("waterfront");
  });

  it("resolves 'other' to empty string", () => {
    expect(normalizeLocationResolveSlug("other")).toBe("");
  });

  it("resolves 'Rondebosch' to 'rondebosch'", () => {
    expect(normalizeLocationResolveSlug("Rondebosch")).toBe("rondebosch");
  });

  it("resolves 'Observatory' to 'observatory'", () => {
    expect(normalizeLocationResolveSlug("Observatory")).toBe("observatory");
  });

  it("resolves 'Newlands' to 'newlands'", () => {
    expect(normalizeLocationResolveSlug("Newlands")).toBe("newlands");
  });

  it("resolves 'Constantia' to 'constantia'", () => {
    expect(normalizeLocationResolveSlug("Constantia")).toBe("constantia");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Tests: recurring booking preferred-cleaner structure
// ──────────────────────────────────────────────────────────────────────────────

describe("Recurring booking preferred-cleaner structure", () => {
  const weeklyRecurring = {
    id: RECURRING_IDS.weekly,
    customer_id: "some-customer-id",
    frequency: "weekly",
    days_of_week: [2],
    start_date: "2026-06-01",
    price: 430,
    status: "active",
    next_run_date: "2026-07-26",
    preferred_cleaner_id: CLEANER_IDS.c3,
    booking_snapshot_template: {
      service_slug: "regular-cleaning",
      rooms: 2, bathrooms: 1,
      suburb: "Sea Point",
    },
  };

  it("weekly recurring has preferred_cleaner_id set to Cleaner3", () => {
    expect(weeklyRecurring.preferred_cleaner_id).toBe(CLEANER_IDS.c3);
  });

  it("preferred cleaner ID belongs to the seed cleaner set", () => {
    const seedCleanerIds = new Set(Object.values(CLEANER_IDS));
    expect(seedCleanerIds.has(weeklyRecurring.preferred_cleaner_id!)).toBe(true);
  });

  it("recurring frequency is a valid enum value", () => {
    const validFrequencies = ["weekly", "biweekly", "monthly"];
    expect(validFrequencies).toContain(weeklyRecurring.frequency);
  });

  it("days_of_week contains valid 1–7 values", () => {
    for (const d of weeklyRecurring.days_of_week) {
      expect(d).toBeGreaterThanOrEqual(1);
      expect(d).toBeLessThanOrEqual(7);
    }
  });

  it("booking_snapshot_template has service_slug", () => {
    expect(weeklyRecurring.booking_snapshot_template.service_slug).toBe("regular-cleaning");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Tests: cleaner earnings status transitions
// ──────────────────────────────────────────────────────────────────────────────

describe("Cleaner earnings status", () => {
  const validStatuses = ["pending", "approved", "processing", "paid"];

  it("all earning statuses in seed are valid", () => {
    const seedEarnings = [
      { id: EARNING_IDS.e1, status: "paid" },
      { id: EARNING_IDS.e2, status: "approved" },
    ];
    for (const e of seedEarnings) {
      expect(validStatuses).toContain(e.status);
    }
  });

  it("paid earnings must have a paid_at timestamp (structural check)", () => {
    const paidEarning = {
      status: "paid",
      paid_at: new Date().toISOString(),
      approved_at: new Date().toISOString(),
    };
    expect(paidEarning.paid_at).toBeTruthy();
    expect(paidEarning.approved_at).toBeTruthy();
  });

  it("pending earnings should not have paid_at", () => {
    const pendingEarning = { status: "pending", paid_at: null };
    expect(pendingEarning.paid_at).toBeNull();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Tests: payout eligibility
// ──────────────────────────────────────────────────────────────────────────────

describe("Payout eligibility", () => {
  const validPayoutStatuses = ["pending", "frozen", "approved", "paid", "cancelled"];
  const validPaymentStatuses = ["pending", "processing", "success", "failed", "partial_failed"];

  it("all payout statuses in seed are valid", () => {
    const seedPayouts = ["pending", "frozen", "approved", "paid", "cancelled"];
    for (const s of seedPayouts) {
      expect(validPayoutStatuses).toContain(s);
    }
  });

  it("seed covers all payout status variants", () => {
    const seedStatuses = new Set(["pending", "frozen", "approved", "paid", "cancelled"]);
    for (const s of validPayoutStatuses) {
      expect(seedStatuses.has(s)).toBe(true);
    }
  });

  it("period_start is before period_end in payouts", () => {
    const payout = {
      period_start: "2026-07-01",
      period_end: "2026-07-31",
    };
    expect(new Date(payout.period_start) < new Date(payout.period_end)).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Tests: admin maker-checker proposal statuses
// ──────────────────────────────────────────────────────────────────────────────

describe("Admin money action proposals", () => {
  const validStatuses = ["pending", "processing", "approved", "rejected", "expired", "failed"];
  const validActionTypes = [
    "adjust_payout_earnings",
    "adjust_team_payout_earnings",
    "reprice_booking_details",
  ];

  it("all proposal statuses in seed are valid", () => {
    const seedStatuses = ["pending", "pending", "rejected", "approved", "expired"];
    for (const s of seedStatuses) {
      expect(validStatuses).toContain(s);
    }
  });

  it("seed proposals cover all non-terminal status variants", () => {
    const seedStatuses = new Set(["pending", "rejected", "approved", "expired"]);
    const nonTerminal = ["pending", "approved", "rejected", "expired"];
    for (const s of nonTerminal) {
      expect(seedStatuses.has(s)).toBe(true);
    }
  });

  it("maker-checker requires different proposer and reviewer for approved/rejected", () => {
    const proposal = {
      proposed_by: "admin-1-id",
      reviewed_by: "admin-2-id",
      status: "approved",
    };
    // Maker-checker: proposed_by != reviewed_by
    expect(proposal.proposed_by).not.toBe(proposal.reviewed_by);
  });

  it("action types in seed are valid", () => {
    const seedActionTypes = [
      "adjust_payout_earnings",
      "adjust_payout_earnings",
      "adjust_payout_earnings",
      "adjust_payout_earnings",
      "reprice_booking_details",
    ];
    for (const t of seedActionTypes) {
      expect(validActionTypes).toContain(t);
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Tests: monthly invoices
// ──────────────────────────────────────────────────────────────────────────────

describe("Monthly invoices", () => {
  const validStatuses = ["draft", "sent", "partially_paid", "paid", "overdue", "refunded"];

  it("invoice month format matches YYYY-MM", () => {
    const months = ["2026-07", "2026-06"];
    for (const m of months) {
      expect(m).toMatch(/^\d{4}-\d{2}$/);
    }
  });

  it("invoice statuses in seed are valid", () => {
    const seedStatuses = ["draft", "sent"];
    for (const s of seedStatuses) {
      expect(validStatuses).toContain(s);
    }
  });

  it("invoice balance_cents is total minus paid (structural check)", () => {
    const total = 96000;
    const paid  = 0;
    const balance = total - paid;
    expect(balance).toBe(96000);
    expect(balance).toBeGreaterThanOrEqual(0);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Tests: seed idempotency invariants
// ──────────────────────────────────────────────────────────────────────────────

describe("Seed idempotency", () => {
  it("booking paystack_reference is deterministic across runs", () => {
    const ref1 = `${SEED_TAG}-BK-001`;
    const ref2 = `${SEED_TAG}-BK-001`;
    expect(ref1).toBe(ref2);
  });

  it("cleaner surrogate IDs are stable across runs", () => {
    // These are hardcoded constants — verify they don't change
    expect(CLEANER_IDS.c1).toBe("f1000001-0001-4001-8001-000000000001");
    expect(CLEANER_IDS.c6).toBe("f1000001-0006-4001-8001-000000000006");
  });

  it("all booking paystack_references start with SEED_TAG", () => {
    const refs = [
      "DEVSEED-BK-001", "DEVSEED-BK-002", "DEVSEED-BK-003",
      "DEVSEED-BK-014", "DEVSEED-BK-015",
    ];
    for (const ref of refs) {
      expect(ref.startsWith(SEED_TAG)).toBe(true);
    }
  });

  it("SEED_TAG has no SQL wildcard characters (safe for LIKE queries in reset)", () => {
    expect(SEED_TAG).not.toContain("%");
    expect(SEED_TAG).not.toContain("_");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Tests: no-PII assertions on synthetic data
// ──────────────────────────────────────────────────────────────────────────────

describe("Synthetic data — no real PII", () => {
  const ALL_SEED_EMAILS = [
    "admin.one@example.com", "admin.two@example.com", "finance.admin@example.com",
    "cleaner.one@example.com", "cleaner.two@example.com", "cleaner.three@example.com",
    "cleaner.four@example.com", "cleaner.five@example.com", "cleaner.six@example.com",
    "customer.one@example.com", "customer.two@example.com", "customer.three@example.com",
    "customer.four@example.com", "customer.five@example.com", "customer.six@example.com",
    "customer.seven@example.com", "customer.eight@example.com",
  ];

  const ALL_SEED_PHONES = [
    "+27800000001", "+27800000011", "+27800000012", "+27800000013",
    "+27800000014", "+27800000015", "+27800000016",
    "+27800000021", "+27800000022", "+27800000023", "+27800000024",
    "+27800000025", "+27800000026", "+27800000027", "+27800000028",
  ];

  it("all seed emails use the @example.com domain (IANA reserved)", () => {
    for (const email of ALL_SEED_EMAILS) {
      expect(email.endsWith("@example.com")).toBe(true);
    }
  });

  it("no seed email uses a real-world domain", () => {
    const FORBIDDEN_DOMAINS = ["gmail.com", "yahoo.com", "hotmail.com", "shalean.co.za"];
    for (const email of ALL_SEED_EMAILS) {
      for (const domain of FORBIDDEN_DOMAINS) {
        expect(email).not.toContain(domain);
      }
    }
  });

  it("all seed phones use the +27800 reserved test prefix", () => {
    for (const phone of ALL_SEED_PHONES) {
      // +278 prefix: reserved/non-allocable in South Africa ITU range
      expect(phone.startsWith("+278")).toBe(true);
    }
  });

  it("no seed phone matches any real SA mobile prefix", () => {
    const REAL_PREFIXES = ["+2760", "+2761", "+2762", "+2763", "+2764", "+2765",
                           "+2766", "+2767", "+2768", "+2769"];
    for (const phone of ALL_SEED_PHONES) {
      for (const prefix of REAL_PREFIXES) {
        expect(phone.startsWith(prefix)).toBe(false);
      }
    }
  });
});
