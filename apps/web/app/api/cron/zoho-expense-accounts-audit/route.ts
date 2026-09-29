import { NextResponse } from "next/server";
import { listZohoExpenseAccounts } from "@/lib/zoho/zohoBooksService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return NextResponse.json({ error: "CRON_SECRET not configured." }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const result = await listZohoExpenseAccounts();
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 502 });

  return NextResponse.json({
    ok: true,
    accounts: result.accounts.map(({ accountId, accountName }) => ({
      account_id: accountId,
      account_name: accountName,
    })),
  });
}
