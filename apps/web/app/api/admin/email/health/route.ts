import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { getDefaultFromAddress, resolveResendApiKey } from "@/lib/email/resendFrom";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Admin: verify Resend config visible to the running Next.js server. */
export async function GET(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const key = resolveResendApiKey();
  if (!key) {
    return NextResponse.json({
      ok: false,
      error: "RESEND_API_KEY is not set in the running server process.",
      hint: "Set it in apps/web/.env.local and restart npm run dev.",
    });
  }

  const domainsRes = await fetch("https://api.resend.com/domains", {
    headers: { Authorization: `Bearer ${key}` },
  });
  const domainsBody = await domainsRes.text();

  let sendProbe: { ok: boolean; error?: string } = { ok: false };
  try {
    const probe = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: getDefaultFromAddress(),
        to: ["delivered@resend.dev"],
        subject: "Shalean Resend health probe",
        html: "<p>Config check from Office.</p>",
      }),
    });
    const probeText = await probe.text();
    sendProbe = probe.ok
      ? { ok: true }
      : { ok: false, error: probeText.slice(0, 240) };
  } catch (err) {
    sendProbe = { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  return NextResponse.json({
    ok: domainsRes.ok && sendProbe.ok,
    keyLength: key.length,
    keyPrefix: key.slice(0, 8),
    from: getDefaultFromAddress(),
    domainsStatus: domainsRes.status,
    domainsPreview: domainsBody.slice(0, 200),
    sendProbe,
  });
}
