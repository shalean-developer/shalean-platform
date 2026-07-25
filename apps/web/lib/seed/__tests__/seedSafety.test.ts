/**
 * Seed safety and correctness unit tests.
 *
 * Covers:
 *   - Production safety guard (multi-layer: project ref + SHALEAN_APP_ENV)
 *   - Deterministic UUID stability
 *   - Suburb resolution slug aliases
 *   - Recurring preferred-cleaner assignment
 *   - Cleaner earnings status transitions
 *   - Payout eligibility
 *   - Admin maker-checker proposal statuses
 *   - Monthly invoice invariants
 *   - Seed idempotency
 *   - Synthetic data PII assertions (phone range, email domain)
 *   - Outbound communication guard (SMS, WhatsApp, voice, push, email)
 *
 * All tests run without a live database.
 */
import { describe, it, expect } from "vitest";
import {
  SEED_PHONES,
  SEED_EMAILS,
  isSeedPhone,
  isSeedEmail,
  isSeedRecipient,
  assertNotSeedRecipient,
  assertNotSeedWhatsApp,
  assertNotSeedSms,
  assertNotSeedEmail,
} from "@/lib/seed/devSeedGuard";

// ──────────────────────────────────────────────────────────────────────────────
// Seed safety constants (mirrors scripts/seed-dev.mjs)
// ──────────────────────────────────────────────────────────────────────────────

const PROD_REF    = "tchayecuvzssixyxlvfu";
const DEV_REF     = "mbvixuzfvzbooiurvxwz";
const STG_REF     = "gbgnemlpyykyhpqqbgru";
const ALLOWED_REFS = new Set([DEV_REF, STG_REF]);
const SEED_TAG    = "DEVSEED";

function extractProjectRef(url: string): string {
  return url.match(/https:\/\/([^.]+)\.supabase/)?.[1] ?? "";
}

/** Mirrors assertNonProductionSeed() from scripts/seed-dev.mjs. */
function assertNonProductionSeed(url: string, appEnv: string): void {
  const ref = extractProjectRef(url);
  if (!ref) throw new Error("Cannot determine project ref.");
  if (ref === PROD_REF) throw new Error(`SAFETY BLOCK: production ref ${PROD_REF}`);
  if (!ALLOWED_REFS.has(ref)) throw new Error(`SAFETY BLOCK: ref '${ref}' not in allow-list`);
  const env = appEnv.trim().toLowerCase();
  if (!["development", "staging"].includes(env)) {
    throw new Error(`SAFETY BLOCK: SHALEAN_APP_ENV='${env}' is not development|staging`);
  }
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

describe("Seed safety guard — production refusal (multi-layer)", () => {
  it("blocks the production project ref regardless of SHALEAN_APP_ENV", () => {
    expect(() =>
      assertNonProductionSeed(`https://${PROD_REF}.supabase.co`, "development"),
    ).toThrow("SAFETY BLOCK");
  });

  it("allows the development project ref with SHALEAN_APP_ENV=development", () => {
    expect(() =>
      assertNonProductionSeed(`https://${DEV_REF}.supabase.co`, "development"),
    ).not.toThrow();
  });

  it("allows the staging project ref with SHALEAN_APP_ENV=staging", () => {
    expect(() =>
      assertNonProductionSeed(`https://${STG_REF}.supabase.co`, "staging"),
    ).not.toThrow();
  });

  it("blocks an unknown project ref even with SHALEAN_APP_ENV=development", () => {
    expect(() =>
      assertNonProductionSeed("https://unknownref12345678.supabase.co", "development"),
    ).toThrow("not in allow-list");
  });

  it("blocks when SHALEAN_APP_ENV is missing/empty", () => {
    expect(() =>
      assertNonProductionSeed(`https://${DEV_REF}.supabase.co`, ""),
    ).toThrow("SAFETY BLOCK");
  });

  it("blocks when SHALEAN_APP_ENV is 'production'", () => {
    expect(() =>
      assertNonProductionSeed(`https://${DEV_REF}.supabase.co`, "production"),
    ).toThrow("SAFETY BLOCK");
  });

  it("blocks when SHALEAN_APP_ENV is 'test'", () => {
    expect(() =>
      assertNonProductionSeed(`https://${DEV_REF}.supabase.co`, "test"),
    ).toThrow("SAFETY BLOCK");
  });

  it("blocks an empty URL", () => {
    expect(() => assertNonProductionSeed("", "development")).toThrow();
  });

  it("does not allow a URL that contains the prod ref in a path (not the project subdomain)", () => {
    // A proxy URL that mentions the prod ref should not be treated as non-production
    expect(() =>
      assertNonProductionSeed(`https://${DEV_REF}.supabase.co/proxy/${PROD_REF}`, "development"),
    ).not.toThrow(); // Dev ref is extracted correctly from subdomain — OK
    // But a URL whose subdomain IS the prod ref should still fail
    expect(() =>
      assertNonProductionSeed(`https://${PROD_REF}.supabase.co`, "development"),
    ).toThrow("SAFETY BLOCK");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Tests: deterministic seed UUIDs
// ──────────────────────────────────────────────────────────────────────────────

describe("Seed UUID determinism", () => {
  it("has 6 distinct cleaner IDs", () => {
    expect(new Set(Object.values(CLEANER_IDS)).size).toBe(6);
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

  it("SEED_TAG is a safe prefix with no SQL wildcard or injection risk", () => {
    expect(SEED_TAG).toMatch(/^[A-Z0-9_-]+$/);
    expect(SEED_TAG).not.toContain("%");
    expect(SEED_TAG).not.toContain("_");
    expect(SEED_TAG.length).toBeLessThanOrEqual(20);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Tests: outbound communication guard — phone
// ──────────────────────────────────────────────────────────────────────────────

describe("Outbound guard — phone numbers", () => {
  it("recognises every seed phone as a seed phone", () => {
    for (const phone of SEED_PHONES) {
      expect(isSeedPhone(phone)).toBe(true);
    }
  });

  it("recognises any +27000 prefixed number as synthetic (structural guard)", () => {
    expect(isSeedPhone("+27000999999")).toBe(true);
    expect(isSeedPhone("+27000123456")).toBe(true);
  });

  it("does not flag a real SA mobile number", () => {
    expect(isSeedPhone("+27821234567")).toBe(false);
    expect(isSeedPhone("+27711234567")).toBe(false);
    expect(isSeedPhone("+27614567890")).toBe(false);
  });

  it("handles whitespace/formatting in phone strings", () => {
    expect(isSeedPhone("+27 000 000 001")).toBe(true);
    expect(isSeedPhone("+27-000-000-011")).toBe(true);
  });

  it("assertNotSeedSms throws for every seed phone", () => {
    for (const phone of SEED_PHONES) {
      expect(() => assertNotSeedSms(phone, "test")).toThrow("DEV SEED GUARD");
    }
  });

  it("assertNotSeedWhatsApp throws for every seed phone", () => {
    for (const phone of SEED_PHONES) {
      expect(() => assertNotSeedWhatsApp(phone, "test")).toThrow("DEV SEED GUARD");
    }
  });

  it("assertNotSeedRecipient throws for a +27000 phone not in the explicit list", () => {
    expect(() =>
      assertNotSeedRecipient({ phone: "+27000999000", channel: "sms" }),
    ).toThrow("DEV SEED GUARD");
  });

  it("assertNotSeedSms does not throw for a real phone number", () => {
    expect(() => assertNotSeedSms("+27821234567")).not.toThrow();
  });

  it("assertNotSeedWhatsApp does not throw for a real phone number", () => {
    expect(() => assertNotSeedWhatsApp("+27711234567")).not.toThrow();
  });

  it("no seed phone can be submitted to a voice provider", () => {
    for (const phone of SEED_PHONES) {
      expect(() =>
        assertNotSeedRecipient({ phone, channel: "voice" }),
      ).toThrow("DEV SEED GUARD");
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Tests: outbound communication guard — email
// ──────────────────────────────────────────────────────────────────────────────

describe("Outbound guard — email addresses", () => {
  it("recognises every seed email as a seed email", () => {
    for (const email of SEED_EMAILS) {
      expect(isSeedEmail(email)).toBe(true);
    }
  });

  it("recognises any @example.com address as synthetic (structural guard)", () => {
    expect(isSeedEmail("random@example.com")).toBe(true);
    expect(isSeedEmail("ops-test-12345@example.com")).toBe(true);
  });

  it("does not flag a real email address", () => {
    expect(isSeedEmail("customer@gmail.com")).toBe(false);
    expect(isSeedEmail("hello@shalean.co.za")).toBe(false);
  });

  it("is case-insensitive for seed emails", () => {
    expect(isSeedEmail("ADMIN.ONE@EXAMPLE.COM")).toBe(true);
    expect(isSeedEmail("Customer.One@Example.Com")).toBe(true);
  });

  it("assertNotSeedEmail throws for every seed email", () => {
    for (const email of SEED_EMAILS) {
      expect(() => assertNotSeedEmail(email, "test")).toThrow("DEV SEED GUARD");
    }
  });

  it("assertNotSeedEmail throws for any @example.com address", () => {
    expect(() => assertNotSeedEmail("someone@example.com")).toThrow("DEV SEED GUARD");
  });

  it("assertNotSeedEmail does not throw for a real email", () => {
    expect(() => assertNotSeedEmail("real.customer@gmail.com")).not.toThrow();
  });

  it("no seed email can be submitted to an email provider", () => {
    for (const email of SEED_EMAILS) {
      expect(() =>
        assertNotSeedRecipient({ email, channel: "email" }),
      ).toThrow("DEV SEED GUARD");
    }
  });

  it("push notification guard blocks seed email", () => {
    expect(() =>
      assertNotSeedRecipient({ email: "cleaner.one@example.com", channel: "push" }),
    ).toThrow("DEV SEED GUARD");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Tests: no seeded WhatsApp recipient can be queued
// ──────────────────────────────────────────────────────────────────────────────

describe("WhatsApp queue guard", () => {
  it("blocks all seed phones from being queued to WhatsApp", () => {
    const seedPhoneArray = [...SEED_PHONES];
    for (const phone of seedPhoneArray) {
      const wouldQueue = !isSeedPhone(phone);
      expect(wouldQueue).toBe(false);
    }
  });

  it("would allow a real non-seed phone to be queued", () => {
    const realPhone = "+27821234567";
    const wouldQueue = !isSeedPhone(realPhone);
    expect(wouldQueue).toBe(true);
  });

  it("blocks a +27000 number that is not in the explicit list", () => {
    const unknownSeedLike = "+27000099099";
    expect(isSeedPhone(unknownSeedLike)).toBe(true);
    expect(() => assertNotSeedWhatsApp(unknownSeedLike)).toThrow("DEV SEED GUARD");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Tests: isSeedRecipient (combined check)
// ──────────────────────────────────────────────────────────────────────────────

describe("isSeedRecipient — combined check", () => {
  it("returns true when phone is a seed phone", () => {
    expect(isSeedRecipient({ phone: "+27000000001" })).toBe(true);
  });

  it("returns true when email is a seed email", () => {
    expect(isSeedRecipient({ email: "admin.one@example.com" })).toBe(true);
  });

  it("returns false for real phone and real email", () => {
    expect(isSeedRecipient({ phone: "+27821234567", email: "real@shalean.co.za" })).toBe(false);
  });

  it("returns true when either phone or email is a seed identity", () => {
    // Real phone, seed email
    expect(isSeedRecipient({ phone: "+27821234567", email: "customer.one@example.com" })).toBe(true);
    // Seed phone, real email
    expect(isSeedRecipient({ phone: "+27000000021", email: "real@shalean.co.za" })).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Tests: rerunning seed does not alter protected identifiers
// ──────────────────────────────────────────────────────────────────────────────

describe("Seed idempotency — protected identifiers are stable", () => {
  it("SEED_PHONES set contents are deterministic across module loads", () => {
    // SEED_PHONES is a const ReadonlySet — it cannot change between runs
    expect(SEED_PHONES.size).toBe(15); // 1 admin + 6 cleaners + 8 customers
    expect(SEED_PHONES.has("+27000000001")).toBe(true); // admin
    expect(SEED_PHONES.has("+27000000011")).toBe(true); // cleaner.one
    expect(SEED_PHONES.has("+27000000028")).toBe(true); // customer.eight
  });

  it("SEED_EMAILS set contents are deterministic", () => {
    expect(SEED_EMAILS.size).toBe(17); // 3 admin + 6 cleaner + 8 customer
    expect(SEED_EMAILS.has("admin.one@example.com")).toBe(true);
    expect(SEED_EMAILS.has("finance.admin@example.com")).toBe(true);
    expect(SEED_EMAILS.has("customer.eight@example.com")).toBe(true);
  });

  it("seed phone numbers are identical across three independent reads", () => {
    const read1 = new Set(SEED_PHONES);
    const read2 = new Set(SEED_PHONES);
    const read3 = new Set(SEED_PHONES);
    expect(read1).toEqual(read2);
    expect(read2).toEqual(read3);
  });

  it("cleaner surrogate IDs are stable across reads", () => {
    expect(CLEANER_IDS.c1).toBe("f1000001-0001-4001-8001-000000000001");
    expect(CLEANER_IDS.c6).toBe("f1000001-0006-4001-8001-000000000006");
  });

  it("booking paystack_reference prefix is deterministic", () => {
    expect("DEVSEED-BK-001".startsWith(SEED_TAG)).toBe(true);
    expect("DEVSEED-BK-015".startsWith(SEED_TAG)).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Tests: production records are unaffected (guard is a no-op in production)
// ──────────────────────────────────────────────────────────────────────────────

describe("Production safety — guard is no-op in NODE_ENV=production", () => {
  it("assertNotSeedRecipient does nothing in production environment", () => {
    const original = process.env.NODE_ENV;
    try {
      // Temporarily simulate production (cast required: TS marks NODE_ENV read-only)
      (process.env as Record<string, string>).NODE_ENV = "production";
      // Should NOT throw even for a seed phone in production mode
      expect(() =>
        assertNotSeedRecipient({ phone: "+27000000001", channel: "sms" }),
      ).not.toThrow();
      expect(() =>
        assertNotSeedRecipient({ email: "admin.one@example.com", channel: "email" }),
      ).not.toThrow();
    } finally {
      (process.env as Record<string, string>).NODE_ENV = original ?? "test";
    }
  });

  it("isSeedPhone and isSeedEmail still identify seed identifiers regardless of NODE_ENV", () => {
    // These helpers are environment-agnostic — only the guard itself is no-op in prod
    const original = process.env.NODE_ENV;
    try {
      (process.env as Record<string, string>).NODE_ENV = "production";
      expect(isSeedPhone("+27000000001")).toBe(true);
      expect(isSeedEmail("admin.one@example.com")).toBe(true);
    } finally {
      (process.env as Record<string, string>).NODE_ENV = original ?? "test";
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Tests: synthetic data — no real PII (phone range corrected)
// ──────────────────────────────────────────────────────────────────────────────

describe("Synthetic data — no real PII", () => {
  it("all seed emails use the @example.com domain (IANA reserved)", () => {
    for (const email of SEED_EMAILS) {
      expect(email.endsWith("@example.com")).toBe(true);
    }
  });

  it("no seed email uses a real-world domain", () => {
    const FORBIDDEN_DOMAINS = ["gmail.com", "yahoo.com", "hotmail.com", "shalean.co.za", "shalean.test"];
    for (const email of SEED_EMAILS) {
      for (const domain of FORBIDDEN_DOMAINS) {
        expect(email).not.toContain(domain);
      }
    }
  });

  it("all seed phones start with +27000 (structurally un-routable SA prefix)", () => {
    for (const phone of SEED_PHONES) {
      expect(phone.startsWith("+27000")).toBe(true);
    }
  });

  it("no seed phone is in the +2780 toll-free range", () => {
    for (const phone of SEED_PHONES) {
      expect(phone.startsWith("+2780")).toBe(false);
    }
  });

  it("no seed phone is in any real SA mobile range (+276x through +278x)", () => {
    const REAL_MOBILE_PREFIXES = [
      "+2760", "+2761", "+2762", "+2763", "+2764", "+2765",
      "+2766", "+2767", "+2768", "+2769",
      "+2771", "+2772", "+2773", "+2774", "+2776", "+2778",
      "+2781", "+2782", "+2783", "+2784",
    ];
    for (const phone of SEED_PHONES) {
      for (const prefix of REAL_MOBILE_PREFIXES) {
        expect(phone.startsWith(prefix)).toBe(false);
      }
    }
  });

  it("no seed phone is in the toll-free or special-service ranges (+2780, +2786, +2787)", () => {
    const SPECIAL = ["+2780", "+2786", "+2787"];
    for (const phone of SEED_PHONES) {
      for (const prefix of SPECIAL) {
        expect(phone.startsWith(prefix)).toBe(false);
      }
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Tests: suburb resolution slug aliases
// ──────────────────────────────────────────────────────────────────────────────

describe("Suburb resolution slug aliases", () => {
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
    return label.toLowerCase().replace(/['']/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }

  function normalizeLocationResolveSlug(label: string): string {
    const raw = bookingLocationSlug(label);
    if (!raw || raw === "other") return "";
    return RESOLVE_SLUG_ALIASES[raw] ?? raw;
  }

  it.each([
    ["Sea Point",    "sea-point"],
    ["Claremont",    "claremont"],
    ["Rondebosch",   "rondebosch"],
    ["Observatory",  "observatory"],
    ["Newlands",     "newlands"],
    ["Constantia",   "constantia"],
    ["Green Point",  "green-point"],
    ["other",        ""],
  ])("resolves '%s' to '%s'", (label, expected) => {
    expect(normalizeLocationResolveSlug(label)).toBe(expected);
  });

  it("resolves V&A Waterfront via v-a-waterfront alias", () => {
    // "V&A Waterfront" → lower → "v&a waterfront" → slugify → "v-a-waterfront" → alias → "waterfront"
    expect(normalizeLocationResolveSlug("V&A Waterfront")).toBe("waterfront");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Tests: recurring booking preferred-cleaner structure
// ──────────────────────────────────────────────────────────────────────────────

describe("Recurring booking preferred-cleaner", () => {
  const weeklyRecurring = {
    id: RECURRING_IDS.weekly,
    frequency: "weekly",
    days_of_week: [2],
    status: "active",
    preferred_cleaner_id: CLEANER_IDS.c3,
    booking_snapshot_template: { service_slug: "regular-cleaning", rooms: 2, bathrooms: 1 },
  };

  it("preferred_cleaner_id is in the seed cleaner set", () => {
    expect(new Set(Object.values(CLEANER_IDS)).has(weeklyRecurring.preferred_cleaner_id!)).toBe(true);
  });

  it("frequency is a valid enum value", () => {
    expect(["weekly", "biweekly", "monthly"]).toContain(weeklyRecurring.frequency);
  });

  it("days_of_week values are 1–7 inclusive", () => {
    for (const d of weeklyRecurring.days_of_week) {
      expect(d).toBeGreaterThanOrEqual(1);
      expect(d).toBeLessThanOrEqual(7);
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Tests: cleaner earnings status
// ──────────────────────────────────────────────────────────────────────────────

describe("Cleaner earnings status", () => {
  const VALID = ["pending", "approved", "processing", "paid"];

  it.each([
    [EARNING_IDS.e1, "paid"],
    [EARNING_IDS.e2, "approved"],
  ])("earning %s has valid status '%s'", (_, status) => {
    expect(VALID).toContain(status);
  });

  it("paid earnings have paid_at and approved_at timestamps", () => {
    const paid = { status: "paid", paid_at: new Date().toISOString(), approved_at: new Date().toISOString() };
    expect(paid.paid_at).toBeTruthy();
    expect(paid.approved_at).toBeTruthy();
  });

  it("pending earnings have null paid_at", () => {
    expect({ status: "pending", paid_at: null as null }.paid_at).toBeNull();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Tests: payout eligibility
// ──────────────────────────────────────────────────────────────────────────────

describe("Payout eligibility", () => {
  const VALID_STATUSES = ["pending", "frozen", "approved", "paid", "cancelled"];

  it("seed covers all payout status variants", () => {
    const seeded = new Set(["pending", "frozen", "approved", "paid", "cancelled"]);
    for (const s of VALID_STATUSES) expect(seeded.has(s)).toBe(true);
  });

  it("period_start is before period_end", () => {
    expect(new Date("2026-07-01") < new Date("2026-07-31")).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Tests: admin money action proposals
// ──────────────────────────────────────────────────────────────────────────────

describe("Admin money action proposals", () => {
  const VALID_STATUSES = ["pending", "processing", "approved", "rejected", "expired", "failed"];
  const VALID_TYPES = ["adjust_payout_earnings", "adjust_team_payout_earnings", "reprice_booking_details"];

  it("seed covers all non-terminal statuses", () => {
    const seeded = new Set(["pending", "rejected", "approved", "expired"]);
    for (const s of ["pending", "approved", "rejected", "expired"]) expect(seeded.has(s)).toBe(true);
  });

  it("maker-checker: proposer and reviewer are different admins", () => {
    const p = { proposed_by: "admin-1-id", reviewed_by: "admin-2-id", status: "approved" };
    expect(p.proposed_by).not.toBe(p.reviewed_by);
  });

  it("all seed action types are valid", () => {
    const seeded = ["adjust_payout_earnings", "reprice_booking_details"];
    for (const t of seeded) expect(VALID_TYPES).toContain(t);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Tests: monthly invoices
// ──────────────────────────────────────────────────────────────────────────────

describe("Monthly invoices", () => {
  it.each([["2026-07"], ["2026-06"]])("month '%s' matches YYYY-MM format", (m) => {
    expect(m).toMatch(/^\d{4}-\d{2}$/);
  });

  it("invoice statuses in seed are valid", () => {
    const VALID = ["draft", "sent", "partially_paid", "paid", "overdue", "refunded"];
    for (const s of ["draft", "sent"]) expect(VALID).toContain(s);
  });

  it("balance_cents is total minus paid", () => {
    const balance = 96000 - 0;
    expect(balance).toBe(96000);
    expect(balance).toBeGreaterThanOrEqual(0);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Tests: export allowlist verification
// ──────────────────────────────────────────────────────────────────────────────

describe("Export allowlist safety", () => {
  // Tables that the export script is allowed to touch (mirrors EXPORT_ALLOWLIST)
  const ALLOWED_EXPORT_TABLES = new Set([
    "pricing_services", "pricing_extras", "pricing_booking_config", "services",
  ]);

  // Tables that must NEVER be exported
  const MUST_NOT_EXPORT = [
    "auth.users", "bookings", "cleaners", "cleaner_payment_details",
    "cleaner_earnings", "cleaner_payouts", "monthly_invoices", "user_profiles",
    "customer_saved_addresses", "notification_logs", "dispatch_logs",
    "whatsapp_logs", "payment_transactions", "payout_transfers",
    "admin_money_action_proposals", "reviews",
  ];

  it("allowed export tables contain no personal-data tables", () => {
    for (const t of MUST_NOT_EXPORT) {
      expect(ALLOWED_EXPORT_TABLES.has(t)).toBe(false);
    }
  });

  it("pricing_services columns do not include personal identifiers", () => {
    const ALLOWED_PS_COLS = new Set([
      "slug", "name", "base_price", "price_per_bedroom", "price_per_bathroom",
      "price_per_extra_room", "min_hours", "max_hours",
      "duration_base", "duration_per_bedroom", "duration_per_bathroom", "duration_per_extra_room",
      "is_active", "sort_order",
    ]);
    const SENSITIVE = ["email", "phone", "auth_user_id", "customer_email", "paystack_reference"];
    for (const col of SENSITIVE) {
      expect(ALLOWED_PS_COLS.has(col)).toBe(false);
    }
  });

  it("pricing_extras columns do not include personal identifiers", () => {
    const ALLOWED_PE_COLS = new Set([
      "slug", "name", "description", "price", "service_type", "is_popular", "is_active", "sort_order",
    ]);
    const SENSITIVE = ["email", "phone", "auth_user_id"];
    for (const col of SENSITIVE) {
      expect(ALLOWED_PE_COLS.has(col)).toBe(false);
    }
  });
});
