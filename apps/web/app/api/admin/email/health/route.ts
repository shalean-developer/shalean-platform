import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { getDefaultFromAddress, resolveResendApiKey } from "@/lib/email/resendFrom";
import { isNonProductionDeployment } from "@/lib/env/deploymentEnvironment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Read-only configuration check. A GET never submits email or exposes key material. */
export async function GET(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const configured = Boolean(resolveResendApiKey());
  return NextResponse.json({
    ok: configured,
    configured,
    from: getDefaultFromAddress(),
    outboundDisabled: process.env.OUTBOUND_MESSAGING_DISABLED === "true",
    providerWritesDisabled: isNonProductionDeployment() || process.env.RESEND_CONTACT_WRITES_DISABLED !== "false",
    sendProbe: { ok: false, skipped: true, reason: "Health checks never send email." },
  }, { headers: { "Cache-Control": "no-store" } });
}
