/**
 * OFFICE-BILLING-E2E-04 — read-only reconciliation of the 20 historical
 * monthly invoices whose stale zoho_invoice_id values were cleared during
 * E2E-03.
 *
 * No writes are performed. The script:
 * - requires the production Supabase project
 * - freezes the exact 20 affected monthly invoice ids
 * - reads local status/amount/invoice-number state
 * - lists Zoho invoices read-only
 * - matches by exact historical invoice number first, then MI-XXXXXXXX reference
 * - detects Zoho invoice ids already owned by other local rows
 * - classifies each row as recoverable / missing / ambiguous
 */

import { createClient } from "@supabase/supabase-js";

import { zohoBooksClient } from "../lib/zoho/zohoBooksClient";
import { formatZohoOrderReference } from "../lib/zoho/zohoOrderReference";

const PROD_REF = "paqjwfulwywtsyyvdxrq";

const TARGET_IDS = [
  "1b3ceaad-6e2a-428b-a3a7-08402414814c",
  "de20361c-9d08-444f-98b8-da9adc674fc9",
  "f256dc70-e775-4079-9cb9-782ccaff8769",
  "6e7326a4-85fc-4c0a-988d-b631eebe6177",
  "ac53de5e-a83b-4cca-b9a8-0f830caa2319",
  "7a1dfcf9-5c47-48d6-b194-f8beb62e5c5e",
  "f2b94630-8f0c-45fa-89b5-f3b5681d4604",
  "777880e9-e88e-43b9-aa8a-f1ee1408828b",
  "4c5b3913-bac7-44b4-905c-9367efa5f459",
  "4b0ff338-5b9a-4e5e-9d80-f1b871ada222",
  "2aa68161-412f-4bad-a219-b56c6ceb86fd",
  "5afee990-0a33-445d-a514-4d91c48494b3",
  "41e1797c-e110-4350-a252-68e073432eea",
  "0ced9c6c-51e3-4125-a3b6-6b2ca384f4cd",
  "6356f9ea-c836-4bfa-a798-9a0e948e39b7",
  "69cae57e-14e6-42fb-8969-3f7764e8882c",
  "2a81cfd4-bff1-4f33-a36f-045849095ae4",
  "cb9760bf-8008-4e8a-a8b9-09297980bc10",
  "f024b3e5-0959-4276-81cd-d7c4ba17d91d",
  "f4848609-9d89-412c-896c-538f5617a0dc",
] as const;

type LocalRow = {
  id: string;
  status: string | null;
  month: string;
  total_amount_cents: number | null;
  amount_paid_cents: number | null;
  zoho_invoice_id: string | null;
  zoho_invoice_number: string | null;
};

type ZohoInvoice = {
  invoice_id: string;
  invoice_number?: string;
  reference_number?: string;
  status?: string;
  total?: number;
  balance?: number;
  date?: string;
  customer_name?: string;
};

type ZohoList = {
  invoices?: ZohoInvoice[];
  page_context?: { has_more_page?: boolean };
};

function fail(message: string): never {
  console.error(`AUDIT_FAIL: ${message}`);
  process.exit(1);
}

async function listAllZohoInvoices(): Promise<ZohoInvoice[]> {
  const all: ZohoInvoice[] = [];
  let page = 1;
  for (;;) {
    const res = await zohoBooksClient.get<ZohoList>(
      `/invoices?page=${page}&per_page=200&sort_column=created_time&sort_order=D`,
    );
    all.push(...(res.invoices ?? []));
    if (!res.page_context?.has_more_page) return all;
    page += 1;
  }
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY ?? "";

  if (!url || !key) fail("missing Supabase service environment");
  if (!url.includes(`${PROD_REF}.supabase.co`)) fail(`refusing non-production Supabase URL: ${url}`);
  if (!process.env.ZOHO_CLIENT_ID || !process.env.ZOHO_REFRESH_TOKEN || !process.env.ZOHO_ORGANIZATION_ID) {
    fail("missing Zoho configuration");
  }

  const admin = createClient(url, key, { auth: { persistSession: false } });

  const { data, error } = await admin
    .from("monthly_invoices")
    .select("id, status, month, total_amount_cents, amount_paid_cents, zoho_invoice_id, zoho_invoice_number")
    .in("id", [...TARGET_IDS]);

  if (error) fail(`local query failed: ${error.message}`);
  const rows = (data ?? []) as LocalRow[];
  if (rows.length !== TARGET_IDS.length) fail(`expected 20 local rows; found ${rows.length}`);

  for (const row of rows) {
    if (String(row.status ?? "").toLowerCase() !== "paid") {
      fail(`row ${row.id} status changed to ${row.status}`);
    }
    if (String(row.zoho_invoice_id ?? "").trim()) {
      fail(`row ${row.id} already regained zoho_invoice_id=${row.zoho_invoice_id}`);
    }
  }

  const [{ data: monthlyLinked }, { data: bookingLinked }, zoho] = await Promise.all([
    admin
      .from("monthly_invoices")
      .select("id, zoho_invoice_id")
      .not("zoho_invoice_id", "is", null),
    admin
      .from("bookings")
      .select("id, zoho_invoice_id")
      .not("zoho_invoice_id", "is", null),
    listAllZohoInvoices(),
  ]);

  const localOwners = new Map<string, string[]>();
  for (const row of monthlyLinked ?? []) {
    const zid = String((row as { zoho_invoice_id?: string }).zoho_invoice_id ?? "").trim();
    if (!zid) continue;
    const owners = localOwners.get(zid) ?? [];
    owners.push(`monthly:${row.id}`);
    localOwners.set(zid, owners);
  }
  for (const row of bookingLinked ?? []) {
    const zid = String((row as { zoho_invoice_id?: string }).zoho_invoice_id ?? "").trim();
    if (!zid) continue;
    const owners = localOwners.get(zid) ?? [];
    owners.push(`booking:${row.id}`);
    localOwners.set(zid, owners);
  }

  const byNumber = new Map<string, ZohoInvoice[]>();
  const byReference = new Map<string, ZohoInvoice[]>();
  for (const inv of zoho) {
    const number = String(inv.invoice_number ?? "").trim().toUpperCase();
    const ref = String(inv.reference_number ?? "").trim().toUpperCase();
    if (number) byNumber.set(number, [...(byNumber.get(number) ?? []), inv]);
    if (ref) byReference.set(ref, [...(byReference.get(ref) ?? []), inv]);
  }

  let recoverable = 0;
  let missing = 0;
  let ambiguous = 0;
  let conflict = 0;

  console.log("OFFICE_BILLING_E2E_04_AUDIT");
  console.log(`LOCAL_TARGETS=${rows.length}`);
  console.log(`ZOHO_INVOICES_SCANNED=${zoho.length}`);

  for (const row of rows.sort((a, b) => a.id.localeCompare(b.id))) {
    const historicalNumber = String(row.zoho_invoice_number ?? "").trim().toUpperCase();
    const expectedRef = formatZohoOrderReference(row.id, "monthly").toUpperCase();

    const numberMatches = historicalNumber ? byNumber.get(historicalNumber) ?? [] : [];
    const refMatches = byReference.get(expectedRef) ?? [];

    const unique = new Map<string, ZohoInvoice>();
    for (const inv of [...numberMatches, ...refMatches]) unique.set(inv.invoice_id, inv);
    const candidates = [...unique.values()];

    let classification: "RECOVERABLE" | "MISSING" | "AMBIGUOUS" | "LOCAL_OWNERSHIP_CONFLICT";
    let candidate: ZohoInvoice | null = null;

    if (candidates.length === 0) {
      classification = "MISSING";
      missing += 1;
    } else if (candidates.length > 1) {
      classification = "AMBIGUOUS";
      ambiguous += 1;
    } else {
      candidate = candidates[0]!;
      const owners = localOwners.get(candidate.invoice_id) ?? [];
      if (owners.length > 0) {
        classification = "LOCAL_OWNERSHIP_CONFLICT";
        conflict += 1;
      } else {
        classification = "RECOVERABLE";
        recoverable += 1;
      }
    }

    const localCents = Math.round(Number(row.total_amount_cents ?? 0));
    const zohoCents = candidate ? Math.round(Number(candidate.total ?? 0) * 100) : null;
    const amountMatch = zohoCents === null ? null : zohoCents === localCents;

    console.log(JSON.stringify({
      id: row.id,
      month: row.month,
      historical_invoice_number: historicalNumber || null,
      expected_reference: expectedRef,
      classification,
      zoho_invoice_id: candidate?.invoice_id ?? null,
      zoho_invoice_number: candidate?.invoice_number ?? null,
      zoho_status: candidate?.status ?? null,
      local_total_cents: localCents,
      zoho_total_cents: zohoCents,
      amount_match: amountMatch,
      local_owners: candidate ? localOwners.get(candidate.invoice_id) ?? [] : [],
    }));
  }

  console.log(
    `SUMMARY recoverable=${recoverable} missing=${missing} ambiguous=${ambiguous} ownership_conflict=${conflict}`,
  );
  console.log("READ_ONLY_COMPLETE");
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
