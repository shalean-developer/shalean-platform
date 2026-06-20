import { NextResponse } from "next/server";
import { sendTestLifecycleEmail } from "@/lib/email/lifecycleEmails";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { logSystemEvent } from "@/lib/logging/systemLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_TYPES = ["reminder_24h", "review_request", "rebook_offer", "rebook_reminder"] as const;

export async function POST(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const adminEmail = auth.email?.trim();
  if (!adminEmail) {
    return NextResponse.json({ error: "Admin email not available." }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as { job_type?: string };
  const jobType = body.job_type?.trim() ?? "";
  if (!VALID_TYPES.includes(jobType as (typeof VALID_TYPES)[number])) {
    return NextResponse.json(
      { error: `job_type must be one of: ${VALID_TYPES.join(", ")}` },
      { status: 400 },
    );
  }

  const result = await sendTestLifecycleEmail(jobType, adminEmail);

  void logSystemEvent({
    level: result.sent ? "info" : "warn",
    source: "admin/lifecycle-emails",
    message: result.sent ? "lifecycle_test_email.sent" : "lifecycle_test_email.failed",
    context: { jobType, to: adminEmail, error: result.error ?? null },
  });

  if (!result.sent) {
    return NextResponse.json({ error: result.error ?? "Send failed." }, { status: 502 });
  }

  return NextResponse.json({ ok: true, job_type: jobType, sent_to: adminEmail });
}
