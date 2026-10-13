/**
 * AUDIT-03A-02B.2: deterministic *candidate* matching, never payment proof.
 * Pure helpers intentionally do not interact with Zoho or the database.
 */
export type ZohoEvidence = {
  source: "expenses" | "banktransactions";
  date?: string;
  reference_number?: string | null;
  description?: string | null;
  vendor_name?: string | null;
  customer_name?: string | null;
  account_name?: string | null;
  amount?: number | string | null;
  total?: number | string | null;
  currency_code?: string | null;
  transaction_type?: string | null;
  status?: string | null;
};

export function normalizeName(s: string): string {
  return s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

export function candidateCleanerMatches(
  evidence: ZohoEvidence,
  cleaners: Array<{ id: string; name: string }>,
): string[] {
  const text = normalizeName([
    evidence.description, evidence.reference_number, evidence.vendor_name,
    evidence.customer_name,
  ].filter(Boolean).join(" "));
  if (!text) return [];
  return cleaners.filter(({ name }) => {
    const full = normalizeName(name);
    // Do not match a single first name against potentially unrelated vendors.
    return full.split(" ").length >= 2 && full.length >= 6 &&
      (" " + text + " ").includes(" " + full + " ");
  }).map((c) => c.id);
}

export function zarCents(e: ZohoEvidence): number | null {
  if (e.currency_code && e.currency_code !== "ZAR") return null;
  const amount = e.total ?? e.amount;
  if (amount === null || amount === undefined || amount === "") return null;
  const n = Number(amount);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

export function withinWindow(date: string | undefined): boolean {
  return Boolean(date && /^2026-(06|07)-\d\d$/.test(date) &&
    date >= "2026-06-01" && date <= "2026-07-31");
}
