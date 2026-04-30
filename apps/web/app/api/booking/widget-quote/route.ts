import { quoteWidgetIntakeFromRecord } from "@/lib/booking/widgetIntakeDryQuote";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const DEPRECATION_HEADERS = {
  "X-API-Deprecation":
    "POST /api/bookings (dryRun) is retired. This route is the supported server quote for homepage / conversion widget intake.",
};

/**
 * Server-only ZAR quote for homepage / conversion widget (same pricing engine as widget checkout insert).
 */
export async function POST(req: Request) {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return Response.json({ success: false, error: "Server unavailable." }, { status: 503, headers: DEPRECATION_HEADERS });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json(
      { success: false, error: "Invalid or missing JSON body" },
      { status: 400, headers: DEPRECATION_HEADERS },
    );
  }

  const rec =
    body !== null && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  if (!rec) {
    return Response.json(
      { success: false, error: "JSON object body required." },
      { status: 400, headers: DEPRECATION_HEADERS },
    );
  }

  const q = await quoteWidgetIntakeFromRecord(admin, rec);
  if (!q.ok) {
    return Response.json({ success: false, error: q.error }, { status: q.status, headers: DEPRECATION_HEADERS });
  }

  return Response.json({ total_paid_zar: q.totalPaidZar }, { status: 200, headers: DEPRECATION_HEADERS });
}
