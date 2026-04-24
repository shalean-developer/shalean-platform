import { NextResponse } from "next/server";
import { requireAdminFromRequest } from "@/lib/admin/requireAdmin";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = typeof value === "object" ? JSON.stringify(value) : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function rowsToCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "id,type,severity,fired_at,resolved_at,occurrence_count,context\n";
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => csvEscape(row[h])).join(","));
  }
  return lines.join("\n");
}

/** CSV export of `notification_alerts` for ops / reporting. Query: `limit` (max 20000, default 5000). */
export async function GET(req: Request) {
  const auth = await requireAdminFromRequest(req);
  if (!auth.ok) return auth.response;

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const limRaw = Number(new URL(req.url).searchParams.get("limit") ?? "5000");
  const limit = Number.isFinite(limRaw) ? Math.min(20_000, Math.max(1, Math.round(limRaw))) : 5000;

  const { data, error } = await admin
    .from("notification_alerts")
    .select(
      "id, type, severity, fired_at, first_fired_at, resolved_at, occurrence_count, is_flapping, flap_count, context",
    )
    .order("fired_at", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as Record<string, unknown>[];
  const csv = rowsToCsv(rows);
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="notification-alerts-${stamp}.csv"`,
    },
  });
}
