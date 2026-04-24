import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { sendEmailFromTemplateKey } from "@/lib/email/sendTemplateEmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: { key?: string; to?: string; data?: unknown; bookingId?: string };
  try {
    body = (await request.json()) as { key?: string; to?: string; data?: unknown; bookingId?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const key = typeof body.key === "string" ? body.key.trim() : "";
  const to = typeof body.to === "string" ? body.to.trim() : "";
  if (!key) return NextResponse.json({ error: "Missing key." }, { status: 400 });
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return NextResponse.json({ error: "Invalid to email." }, { status: 400 });
  }

  const data =
    body.data && typeof body.data === "object" && !Array.isArray(body.data)
      ? (body.data as Record<string, unknown>)
      : {};

  const bookingId = typeof body.bookingId === "string" ? body.bookingId.trim() : null;
  const sent = await sendEmailFromTemplateKey({ to, key, data, bookingId });
  if (!sent.ok) {
    return NextResponse.json({ success: false, error: sent.error }, { status: sent.error === "Template not found" ? 404 : 502 });
  }
  return NextResponse.json({ success: true });
}
