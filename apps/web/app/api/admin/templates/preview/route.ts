import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { previewTemplateRender } from "@/lib/email/sendTemplateEmail";
import type { TemplateChannel } from "@/lib/templates/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CHANNELS: TemplateChannel[] = ["email", "whatsapp", "sms"];

export async function POST(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: { key?: string; channel?: string; data?: unknown };
  try {
    body = (await request.json()) as { key?: string; channel?: string; data?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const key = typeof body.key === "string" ? body.key.trim() : "";
  const channel = typeof body.channel === "string" ? (body.channel.trim() as TemplateChannel) : null;
  if (!key) return NextResponse.json({ error: "Missing key." }, { status: 400 });
  if (!channel || !CHANNELS.includes(channel)) {
    return NextResponse.json({ error: "Invalid channel." }, { status: 400 });
  }

  const data =
    body.data && typeof body.data === "object" && !Array.isArray(body.data)
      ? (body.data as Record<string, unknown>)
      : {};

  const rendered = await previewTemplateRender({ key, channel, data });
  if (!rendered) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    subject: rendered.subject,
    content: rendered.content,
  });
}
