/**
 * AUDIT-03A-02B.2: deterministic *candidate* matching, never payment proof.
 * Pure helpers intentionally do not interact with Zoho or the database.
 */
export type ZohoEvidence = {
  source: "expenses" | "banktransactions";
  date?: string;
  expense_id?: string | null;
  transaction_id?: string | null;
  payee?: string | null;
  paid_through_account_name?: string | null;
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
    evidence.customer_name, evidence.payee,
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

/** Keep provider records distinct across sources; no inference that an expense was settled. */
export function evidenceKey(e: ZohoEvidence): string | null {
  const id = e.source === "expenses" ? e.expense_id : e.transaction_id;
  return id ? e.source + ":" + id : null;
}
export function uniqueEvidence(rows: ZohoEvidence[]): { rows: ZohoEvidence[]; unknownIdentity: number } {
  const seen = new Set<string>();
  let unknownIdentity = 0;
  const output: ZohoEvidence[] = [];
  for (const row of rows) {
    const key = evidenceKey(row);
    if (!key) { unknownIdentity++; output.push(row); continue; }
    if (!seen.has(key)) { seen.add(key); output.push(row); }
  }
  return { rows: output, unknownIdentity };
}
export function potentiallySettled(e: ZohoEvidence): boolean {
  // An expense is never proof of a completed bank transfer.
  if (e.source !== "banktransactions") return false;
  const status = normalizeName(e.status ?? "");
  const type = normalizeName(e.transaction_type ?? "");
  return ["cleared", "reconciled"].includes(status) &&
    ["withdrawal", "expense", "payment", "bank transfer"].includes(type);
}
