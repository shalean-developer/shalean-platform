import { NextResponse } from "next/server";
import { requireAdminFromRequest } from "@/lib/admin/requireAdmin";
import { getWhatsAppTemplateReadiness } from "@/lib/whatsapp/templateReadiness";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAdminFromRequest(request);
  if (!auth.ok) return auth.response;

  const templates = getWhatsAppTemplateReadiness();
  const totals = templates.reduce(
    (acc, item) => {
      acc.total += 1;
      acc[item.approvalStatus] += 1;
      if (item.sendReady) acc.sendReady += 1;
      return acc;
    },
    { total: 0, approved: 0, pending: 0, rejected: 0, unknown: 0, sendReady: 0 },
  );

  return NextResponse.json({ fetchedAt: new Date().toISOString(), totals, templates });
}
