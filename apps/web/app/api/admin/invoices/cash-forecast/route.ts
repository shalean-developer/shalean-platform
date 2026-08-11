import { NextResponse } from "next/server";
import { requireFinanceApi } from "@/lib/auth/requireFinanceApi";
import { loadMonthlyInvoiceCashForecast } from "@/lib/monthlyInvoice/monthlyInvoiceCashForecast";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireFinanceApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  try {
    const forecast = await loadMonthlyInvoiceCashForecast(admin);
    return NextResponse.json(forecast);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load invoice cash forecast.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
