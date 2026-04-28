import { NextResponse } from "next/server";

import { finalizeDueMonthlyInvoices } from "@/lib/monthlyInvoice/finalizeDueMonthlyInvoices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Vercel / Supabase cron: `Authorization: Bearer CRON_SECRET`.
 * Runs daily; finalizes draft invoices whose month has ended (today ≥ last day of that month, JHB date).
 * Idempotent if the last-day run was missed.
 *
 * Suggested: daily 06:00 SAST → POST /api/cron/finalize-monthly-invoices
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return NextResponse.json({ error: "CRON_SECRET not configured." }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const result = await finalizeDueMonthlyInvoices();
  if (!result.ok) {
    return NextResponse.json({ error: result.reason ?? "finalize_failed" }, { status: 500 });
  }

  return NextResponse.json(result);
}

export async function GET(request: Request) {
  return POST(request);
}
