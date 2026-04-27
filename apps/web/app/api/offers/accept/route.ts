import { NextResponse } from "next/server";
import { acceptDispatchOffer } from "@/lib/dispatch/dispatchOffers";
import { fetchDispatchOfferRowByToken, isValidOfferTokenFormat } from "@/lib/dispatch/offerByToken";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: { token?: unknown };
  try {
    body = (await request.json()) as { token?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (!token) return NextResponse.json({ error: "Missing token." }, { status: 400 });
  if (!isValidOfferTokenFormat(token)) {
    return NextResponse.json({ error: "Invalid token format." }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const row = await fetchDispatchOfferRowByToken(admin, token);
  if (!row) return NextResponse.json({ error: "Invalid or unknown offer." }, { status: 404 });

  if (row.status !== "pending") {
    return NextResponse.json(
      { error: "This offer is no longer pending.", status: row.status },
      { status: 409 },
    );
  }

  const expMs = new Date(row.expiresAtIso).getTime();
  if (Number.isFinite(expMs) && Date.now() >= expMs) {
    return NextResponse.json({ error: "This offer has expired." }, { status: 410 });
  }

  const r = await acceptDispatchOffer({
    supabase: admin,
    offerId: row.offerId,
    cleanerId: row.cleanerId,
  });

  if (!r.ok) {
    const status =
      r.failure === "not_found"
        ? 404
        : r.failure === "wrong_cleaner"
          ? 403
          : r.failure === "expired"
            ? 410
            : 400;
    return NextResponse.json({ error: r.error, failure: r.failure }, { status });
  }

  return NextResponse.json({ ok: true, status: "accepted" });
}
