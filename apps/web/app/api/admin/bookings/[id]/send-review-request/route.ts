import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { sendAdminReviewRequestEmail } from "@/lib/reviews/sendAdminReviewRequestEmail";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id: bookingId } = await ctx.params;
  if (!bookingId?.trim()) {
    return NextResponse.json({ error: "Missing booking id." }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  try {
    const result = await sendAdminReviewRequestEmail(admin, bookingId.trim());

    await logSystemEvent({
      level: result.ok ? "info" : "warn",
      source: "admin_send_review_request",
      message: result.ok ? "Admin sent review request email" : "Admin review request email failed",
      context: {
        bookingId: bookingId.trim(),
        sentTo: result.ok ? result.sentTo : null,
        code: result.ok ? null : result.code,
        error: result.ok ? null : result.error,
      },
    });

    if (!result.ok) {
      const status =
        result.code === "not_found"
          ? 404
          : result.code === "review_exists" || result.code.startsWith("review_") || result.code.includes("booking")
            ? 400
            : result.code === "send_failed"
              ? 502
              : 400;
      return NextResponse.json({ ok: false, error: result.error, code: result.code }, { status });
    }

    return NextResponse.json({ ok: true, sent_to: result.sentTo });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
