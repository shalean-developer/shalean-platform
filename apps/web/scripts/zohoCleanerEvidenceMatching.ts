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
    const tokens = full.split(" ").filter(Boolean);
    if (tokens.length < 2 || full.length < 6) return false;
    if ((" " + text + " ").includes(" " + full + " ")) return true;
    // Candidate-only match: first + last tokens in either order,
    // allowing omitted middle names. Do not infer settlement from this.
    const first = tokens[0], last = tokens[tokens.length - 1];
    if (first.length < 3 || last.length < 3) return false;
    const words = text.split(" ");
    return words.some((word, i) =>
      (word === first && words[i + 1] === last) ||
      (word === last && words[i + 1] === first));

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
export function potentiallySettled(_e: ZohoEvidence): boolean {
  // Zoho categorization or matching is not proof of bank settlement.
  return false;
}

/** Injectable GET-only transport allows deterministic pagination tests without OAuth or network. */
export async function listZohoEvidencePages(
  endpoint: "expenses" | "banktransactions",
  get: (path: string) => Promise<Record<string, unknown>>,
): Promise<ZohoEvidence[]> {
  const all: ZohoEvidence[] = [];
  for (let page = 1; page <= 20; page++) {
    const filters = endpoint === "expenses" ? "date_start=2026-06-01&date_end=2026-07-31" : "date_after=2026-05-31&date_before=2026-08-01";
    const path = `/${endpoint}?${filters}&per_page=200&page=${page}`;
    const response = await get(path);
    const rows = response[endpoint];
    if (!Array.isArray(rows)) throw new Error(`Zoho ${endpoint} response missing array`);
    // Documented Zoho list envelopes are inconsistent across endpoints.
    // Fetch until a short page, always bounding requests and checking replay.
    // Never accept explicit contradictory pagination metadata.
    const context = response.page_context;
    if (context !== undefined && !Array.isArray(context) &&
        (typeof context !== "object" || context === null)) {
      throw new Error(`Zoho ${endpoint} malformed page_context`);
    }
    for (const row of rows) {
      if (!row || typeof row !== "object" || Array.isArray(row)) {
        throw new Error(`Zoho ${endpoint} malformed row`);
      }
      all.push({ ...(row as ZohoEvidence), source: endpoint });
    }
    if (rows.length > 200) throw new Error(`Zoho ${endpoint} oversized page`);
    if (rows.length < 200) return all;
  }
  throw new Error(`Zoho ${endpoint} exceeded 20 pages; incomplete audit refused`);
}
