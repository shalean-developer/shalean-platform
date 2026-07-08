import { NextResponse } from "next/server";
import { loadBookingForRebookPrefill } from "@/lib/customer/loadRebookLandingContext";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Token-authenticated booking prefill for returning customers arriving from re-engagement emails.
 * Avoids requiring sign-in before schedule selection.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const rt = url.searchParams.get("rt")?.trim() ?? "";
  const rebookId = url.searchParams.get("rebook")?.trim() ?? "";

  if (!rt || !rebookId) {
    return NextResponse.json({ error: "Missing rebook parameters." }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  const booking = await loadBookingForRebookPrefill(admin, rebookId, rt);
  if (!booking) {
    return NextResponse.json({ error: "Invalid or expired link." }, { status: 403 });
  }

  return NextResponse.json({ booking });
}
