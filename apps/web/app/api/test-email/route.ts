import { Resend } from "resend";
import { NextResponse } from "next/server";
import { getDefaultFromAddress } from "@/lib/email/sendBookingEmail";
import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorize(request: Request): boolean {
  const cron = process.env.CRON_SECRET?.trim();
  const test = process.env.EMAIL_TEST_SECRET?.trim();
  const auth = request.headers.get("authorization");
  if (cron && auth === `Bearer ${cron}`) return true;
  if (test && auth === `Bearer ${test}`) return true;
  return false;
}

/**
 * POST /api/test-email — send a one-off test message via Resend.
 * Requires `Authorization: Bearer` with `CRON_SECRET` or `EMAIL_TEST_SECRET`.
 * Body (optional): `{ "to": "you@example.com" }` — defaults to first ADMIN_EMAILS entry or RESEND_FROM.
 */
export async function POST(request: Request) {
  if (!authorize(request)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized. Set CRON_SECRET or EMAIL_TEST_SECRET and send Bearer token." },
      { status: 401 },
    );
  }

  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) {
    return NextResponse.json({ ok: false, error: "RESEND_API_KEY not set." }, { status: 503 });
  }

  let to = "";
  try {
    const body = (await request.json()) as { to?: string };
    to = typeof body?.to === "string" ? body.to.trim() : "";
  } catch {
    to = "";
  }

  if (!to) {
    const admins = process.env.ADMIN_EMAILS?.split(",")[0]?.trim();
    to = admins || "";
  }
  if (!to) {
    return NextResponse.json(
      { ok: false, error: 'Provide body { "to": "email@example.com" } or set ADMIN_EMAILS.' },
      { status: 400 },
    );
  }

  const resend = new Resend(key);
  const from = getDefaultFromAddress();

  try {
    const { error } = await resend.emails.send({
      from,
      to,
      subject: "Shalean — test email",
      html: "<p>This is a test email from the booking platform.</p>",
    });

    if (error) {
      await reportOperationalIssue("error", "api/test-email", error.message, { to });
      return NextResponse.json({ ok: false, error: error.message }, { status: 502 });
    }

    await logSystemEvent({
      level: "info",
      source: "api/test-email",
      message: "Test email sent",
      context: { to },
    });
    return NextResponse.json({ ok: true, to });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await reportOperationalIssue("error", "api/test-email", `Test email send threw: ${msg}`, { err: msg, to });
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
}
