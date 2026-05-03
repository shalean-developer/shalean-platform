import { NextResponse } from "next/server";
import { fetchDispatchOfferPublicByToken } from "@/lib/dispatch/offerByToken";
import { isValidOfferTokenFormat } from "@/lib/dispatch/offerTokenFormat";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  if (!token?.trim() || !isValidOfferTokenFormat(token)) {
    return NextResponse.json({ error: "Invalid token format." }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const data = await fetchDispatchOfferPublicByToken(admin, token);
  if (!data) return NextResponse.json({ error: "Offer not found." }, { status: 404 });

  return NextResponse.json(data);
}
