import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type LeanEarning = {
  cleaner_id: string;
  amount_cents: number;
  status: string;
  paid_at: string | null;
};

const PAGE = 1000;
const MAX_ROWS = 80_000;

async function loadAllLeanEarnings(admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>): Promise<{ rows: LeanEarning[]; truncated: boolean }> {
  const out: LeanEarning[] = [];
  let from = 0;
  let truncated = false;
  for (;;) {
    const { data, error } = await admin
      .from("cleaner_earnings")
      .select("cleaner_id, amount_cents, status, paid_at")
      .order("created_at", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const chunk = data ?? [];
    for (const raw of chunk) {
      const r = raw as { cleaner_id?: string; amount_cents?: number; status?: string; paid_at?: string | null };
      const cid = String(r.cleaner_id ?? "").trim();
      if (!cid) continue;
      out.push({
        cleaner_id: cid,
        amount_cents: Math.max(0, Math.round(Number(r.amount_cents) || 0)),
        status: String(r.status ?? "").toLowerCase(),
        paid_at: r.paid_at ?? null,
      });
    }
    if (chunk.length < PAGE) break;
    from += PAGE;
    if (from >= MAX_ROWS) {
      truncated = true;
      break;
    }
  }
  return { rows: out, truncated };
}

function startOfPaidWindowDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

function aggregateFromLean(lean: LeanEarning[]) {
  let pending_cents = 0;
  let approved_cents = 0;
  let processing_cents = 0;
  let paid_cents_all = 0;
  let paid_last_30d_cents = 0;
  const cutoff30 = startOfPaidWindowDaysAgo(30);

  type Agg = {
    cleaner_id: string;
    full_name: string;
    pending_cents: number;
    approved_cents: number;
    processing_cents: number;
    paid_cents: number;
    pending_count: number;
    approved_count: number;
    processing_count: number;
    paid_count: number;
  };
  const by = new Map<string, Agg>();

  for (const r of lean) {
    const c = r.amount_cents;
    const st = r.status;
    if (st === "pending") pending_cents += c;
    else if (st === "approved") approved_cents += c;
    else if (st === "processing") processing_cents += c;
    else if (st === "paid") {
      paid_cents_all += c;
      const paidAt = r.paid_at ? String(r.paid_at) : "";
      if (paidAt && paidAt >= cutoff30) paid_last_30d_cents += c;
    }

    const cur = by.get(r.cleaner_id) ?? {
      cleaner_id: r.cleaner_id,
      full_name: r.cleaner_id,
      pending_cents: 0,
      approved_cents: 0,
      processing_cents: 0,
      paid_cents: 0,
      pending_count: 0,
      approved_count: 0,
      processing_count: 0,
      paid_count: 0,
    };
    if (st === "pending") {
      cur.pending_cents += c;
      cur.pending_count += 1;
    } else if (st === "approved") {
      cur.approved_cents += c;
      cur.approved_count += 1;
    } else if (st === "processing") {
      cur.processing_cents += c;
      cur.processing_count += 1;
    } else if (st === "paid") {
      cur.paid_cents += c;
      cur.paid_count += 1;
    }
    by.set(r.cleaner_id, cur);
  }

  return {
    totals: {
      pending_cents,
      approved_cents,
      processing_cents,
      paid_cents: paid_cents_all,
      paid_last_30d_cents,
    },
    by_cleaner: [...by.values()].sort((a, b) => b.pending_cents + b.approved_cents - (a.pending_cents + a.approved_cents)),
  };
}

export async function GET(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const cleanerFilter = new URL(request.url).searchParams.get("cleaner_id")?.trim() ?? "";
  const limit = Math.min(500, Math.max(20, Number(new URL(request.url).searchParams.get("limit")) || 200));

  /** Per-cleaner booking rows for expanded table (no `cleaner_id` = global summary only). */
  if (!/^[0-9a-f-]{36}$/i.test(cleanerFilter)) {
    let truncated = false;
    let lean: LeanEarning[] = [];
    try {
      const res = await loadAllLeanEarnings(admin);
      lean = res.rows;
      truncated = res.truncated;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ error: msg }, { status: 500 });
    }

    const { totals, by_cleaner } = aggregateFromLean(lean);
    const cleanerIds = by_cleaner.map((c) => c.cleaner_id);

    const [{ data: cleanerRows }, { data: paymentRows }] = await Promise.all([
      cleanerIds.length ? admin.from("cleaners").select("id, full_name").in("id", cleanerIds) : Promise.resolve({ data: [] }),
      cleanerIds.length
        ? admin.from("cleaner_payment_details").select("cleaner_id, bank_code, account_number, account_name, recipient_code").in("cleaner_id", cleanerIds)
        : Promise.resolve({ data: [] }),
    ]);

    const cleanerName = new Map<string, string>();
    for (const c of cleanerRows ?? []) {
      const row = c as { id?: string; full_name?: string | null };
      if (row.id) cleanerName.set(String(row.id), String(row.full_name ?? "").trim() || String(row.id));
    }

    const bank = new Map<string, { bank_ready: boolean; recipient_ready: boolean; missing_reason: string | null }>();
    for (const cid of cleanerIds) {
      bank.set(cid, { bank_ready: false, recipient_ready: false, missing_reason: "No bank details on file" });
    }
    for (const p of paymentRows ?? []) {
      const row = p as {
        cleaner_id?: string;
        bank_code?: string | null;
        account_number?: string | null;
        account_name?: string | null;
        recipient_code?: string | null;
      };
      const cid = String(row.cleaner_id ?? "").trim();
      if (!cid) continue;
      const acct = String(row.account_number ?? "").replace(/\s+/g, "").trim();
      const code = String(row.bank_code ?? "").trim();
      const name = String(row.account_name ?? "").replace(/\s+/g, " ").trim();
      const rec = String(row.recipient_code ?? "").trim();
      const bankOk = /^[A-Za-z0-9_-]{2,20}$/.test(code) && /^\d{6,20}$/.test(acct) && name.length >= 2;
      let missing: string | null = null;
      if (!bankOk) missing = "Missing or invalid bank account details";
      bank.set(cid, {
        bank_ready: bankOk,
        recipient_ready: rec.length > 0,
        missing_reason: missing,
      });
    }

    const merged = by_cleaner.map((c) => ({
      ...c,
      full_name: cleanerName.get(c.cleaner_id) ?? c.full_name,
      ...(bank.get(c.cleaner_id) ?? { bank_ready: false, recipient_ready: false, missing_reason: "No bank details on file" }),
    }));

    return NextResponse.json({
      totals,
      by_cleaner: merged,
      rows: [],
      truncated,
    });
  }

  let q = admin
    .from("cleaner_earnings")
    .select("id, cleaner_id, booking_id, amount_cents, status, created_at, approved_at, paid_at, disbursement_id")
    .eq("cleaner_id", cleanerFilter)
    .order("created_at", { ascending: false })
    .limit(limit);

  const { data: rows, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const list = rows ?? [];
  const cleanerIds = [...new Set(list.map((r) => String((r as { cleaner_id?: string }).cleaner_id ?? "")).filter(Boolean))];
  const bookingIds = [...new Set(list.map((r) => String((r as { booking_id?: string }).booking_id ?? "")).filter(Boolean))];

  const [{ data: cleanerRows }, { data: bookingRows }] = await Promise.all([
    cleanerIds.length
      ? admin.from("cleaners").select("id, full_name").in("id", cleanerIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string | null }[] }),
    bookingIds.length
      ? admin.from("bookings").select("id, date, service, location").in("id", bookingIds)
      : Promise.resolve({ data: [] as { id: string; date: string | null; service: string | null; location: string | null }[] }),
  ]);

  const cleanerName = new Map<string, string>();
  for (const c of cleanerRows ?? []) {
    const row = c as { id?: string; full_name?: string | null };
    if (row.id) cleanerName.set(String(row.id), String(row.full_name ?? "").trim() || String(row.id));
  }
  const bookingMeta = new Map<string, { date: string | null; service: string | null; location: string | null }>();
  for (const b of bookingRows ?? []) {
    const row = b as { id?: string; date?: string | null; service?: string | null; location?: string | null };
    if (row.id) bookingMeta.set(String(row.id), { date: row.date ?? null, service: row.service ?? null, location: row.location ?? null });
  }

  let pending_total = 0;
  let approved_total = 0;
  let paid_total = 0;
  let processing_total = 0;
  let paid_last_30d = 0;
  const cutoff30 = startOfPaidWindowDaysAgo(30);
  const by_cleaner = new Map<
    string,
    {
      cleaner_id: string;
      full_name: string;
      pending_cents: number;
      approved_cents: number;
      processing_cents: number;
      paid_cents: number;
      pending_count: number;
      approved_count: number;
      processing_count: number;
      paid_count: number;
    }
  >();

  const enriched = list.map((raw) => {
    const r = raw as {
      cleaner_id?: string;
      booking_id?: string;
      amount_cents?: number;
      status?: string;
      paid_at?: string | null;
    };
    const cid = String(r.cleaner_id ?? "");
    const bid = String(r.booking_id ?? "");
    const cents = Math.max(0, Math.round(Number(r.amount_cents) || 0));
    const st = String(r.status ?? "").toLowerCase();
    if (st === "pending") pending_total += cents;
    else if (st === "approved") approved_total += cents;
    else if (st === "paid") {
      paid_total += cents;
      const pAt = r.paid_at ? String(r.paid_at) : "";
      if (pAt && pAt >= cutoff30) paid_last_30d += cents;
    } else if (st === "processing") processing_total += cents;

    if (cid) {
      const name = cleanerName.get(cid) ?? cid;
      const cur = by_cleaner.get(cid) ?? {
        cleaner_id: cid,
        full_name: name,
        pending_cents: 0,
        approved_cents: 0,
        processing_cents: 0,
        paid_cents: 0,
        pending_count: 0,
        approved_count: 0,
        processing_count: 0,
        paid_count: 0,
      };
      if (st === "pending") {
        cur.pending_cents += cents;
        cur.pending_count += 1;
      } else if (st === "approved") {
        cur.approved_cents += cents;
        cur.approved_count += 1;
      } else if (st === "processing") {
        cur.processing_cents += cents;
        cur.processing_count += 1;
      } else if (st === "paid") {
        cur.paid_cents += cents;
        cur.paid_count += 1;
      }
      by_cleaner.set(cid, cur);
    }

    return {
      ...r,
      cleaner_name: cleanerName.get(cid) ?? null,
      booking: bookingMeta.get(bid) ?? null,
    };
  });

  const { data: payRow } = await admin
    .from("cleaner_payment_details")
    .select("cleaner_id, bank_code, account_number, account_name, recipient_code")
    .eq("cleaner_id", cleanerFilter)
    .maybeSingle();
  const pr = payRow as {
    bank_code?: string | null;
    account_number?: string | null;
    account_name?: string | null;
    recipient_code?: string | null;
  } | null;
  const acct = String(pr?.account_number ?? "").replace(/\s+/g, "").trim();
  const code = String(pr?.bank_code ?? "").trim();
  const name = String(pr?.account_name ?? "").replace(/\s+/g, " ").trim();
  const rec = String(pr?.recipient_code ?? "").trim();
  const bank_ready = /^[A-Za-z0-9_-]{2,20}$/.test(code) && /^\d{6,20}$/.test(acct) && name.length >= 2;
  const recipient_ready = rec.length > 0;
  const missing_reason = !bank_ready ? "Missing or invalid bank account details" : null;

  return NextResponse.json({
    totals: {
      pending_cents: pending_total,
      approved_cents: approved_total,
      processing_cents: processing_total,
      paid_cents: paid_total,
      paid_last_30d_cents: paid_last_30d,
    },
    by_cleaner: [
      {
        ...(by_cleaner.get(cleanerFilter) ?? {
          cleaner_id: cleanerFilter,
          full_name: cleanerName.get(cleanerFilter) ?? cleanerFilter,
          pending_cents: 0,
          approved_cents: 0,
          processing_cents: 0,
          paid_cents: 0,
          pending_count: 0,
          approved_count: 0,
          processing_count: 0,
          paid_count: 0,
        }),
        full_name: cleanerName.get(cleanerFilter) ?? by_cleaner.get(cleanerFilter)?.full_name ?? cleanerFilter,
        bank_ready,
        recipient_ready,
        missing_reason,
      },
    ],
    rows: enriched,
  });
}
