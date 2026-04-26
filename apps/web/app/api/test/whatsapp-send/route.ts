import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { enqueueWhatsApp, flushWhatsAppJobById } from "@/lib/whatsapp/queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Smoke-test Meta WhatsApp via the real queue + flush path.
 * Requires `Authorization: Bearer WHATSAPP_TEST_SEND_SECRET` (never ship without this secret in env).
 */
export async function POST(request: Request) {
  const secret = process.env.WHATSAPP_TEST_SEND_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "WHATSAPP_TEST_SEND_SECRET is not configured on the server." },
      { status: 503 },
    );
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }
  const o = body as Record<string, unknown>;
  const phone = typeof o.phone === "string" ? o.phone.trim() : "";
  const message = typeof o.message === "string" ? o.message : "";
  if (!phone || !message.trim()) {
    return NextResponse.json({ ok: false, error: "Body must include non-empty `phone` and `message`." }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "Supabase admin not configured." }, { status: 503 });
  }

  const idempotencyKey = `api_test_whatsapp_send:${randomUUID()}`;
  const enq = await enqueueWhatsApp({
    admin,
    phone,
    phoneRaw: phone,
    type: "text",
    payload: { kind: "text", text: message },
    context: { source: "api_test_whatsapp_send", skip_terminal_worker_sms: true },
    idempotencyKey,
    priority: 0,
  });

  if (enq.id === null) {
    await logSystemEvent({
      level: "warn",
      source: "whatsapp_send",
      message: "Test WhatsApp enqueue failed",
      context: { error: enq.error },
    });
    return NextResponse.json({ ok: false, error: enq.error }, { status: 502 });
  }

  const flush = await flushWhatsAppJobById(admin, enq.id);
  const { data: row } = await admin
    .from("whatsapp_queue")
    .select("status,meta_message_id,last_error")
    .eq("id", enq.id)
    .maybeSingle();

  const st = String((row as { status?: string } | null)?.status ?? "");
  const metaId = String((row as { meta_message_id?: string | null } | null)?.meta_message_id ?? "");
  const lastErr = String((row as { last_error?: string | null } | null)?.last_error ?? "");

  await logSystemEvent({
    level: flush.ok ? "info" : "warn",
    source: "whatsapp_send",
    message: flush.ok ? "Test WhatsApp send completed" : "Test WhatsApp flush failed",
    context: {
      queue_id: enq.id,
      flush_ok: flush.ok,
      status: st,
      meta_message_id: metaId || null,
    },
  });

  return NextResponse.json({
    ok: flush.ok,
    queue_id: enq.id,
    flush: { ok: flush.ok, error: flush.error ?? null },
    status: st,
    meta_message_id: metaId || null,
    last_error: lastErr || null,
  });
}
