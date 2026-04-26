import { NextResponse } from "next/server";
import { metaWhatsAppToDigits, resolveWhatsAppBearerToken } from "@/lib/dispatch/metaWhatsAppSend";
import { sendTestWhatsApp } from "@/lib/whatsapp/sendTestWhatsApp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Direct Meta WhatsApp text (bypasses queue). Guard with `Authorization: Bearer WHATSAPP_TEST_SEND_SECRET`.
 * POST JSON: `{ "phone": "+27…", "message"?: "optional body" }`
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

  const tokenPresent = Boolean(resolveWhatsAppBearerToken());
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  if (!tokenPresent || !phoneNumberId) {
    return NextResponse.json(
      {
        ok: false,
        error: "Missing WHATSAPP_PHONE_NUMBER_ID or bearer token (WHATSAPP_ACCESS_TOKEN / WHATSAPP_API_TOKEN).",
        config: { hasToken: tokenPresent, hasPhoneNumberId: Boolean(phoneNumberId) },
      },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }
  const o = body as Record<string, unknown>;
  const phone = typeof o.phone === "string" ? o.phone.trim() : "";
  const message =
    typeof o.message === "string" && o.message.trim() ? o.message.trim() : `Direct test ${new Date().toISOString()}`;
  if (!phone) {
    return NextResponse.json({ ok: false, error: "Body must include non-empty `phone`." }, { status: 400 });
  }

  const toDigits = metaWhatsAppToDigits(phone);
  const payloadPreview = {
    messaging_product: "whatsapp",
    to: `${toDigits.slice(0, 4)}…${toDigits.slice(-4)}`,
    type: "text",
    text_len: message.length,
  };

  try {
    const { messageId } = await sendTestWhatsApp(phone, message);
    return NextResponse.json({
      ok: true,
      messageId,
      requestPayloadPreview: payloadPreview,
      note: "Check server logs for [WhatsApp Meta] POST /messages ok|error and full Graph response preview.",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      {
        ok: false,
        error: msg,
        requestPayloadPreview: payloadPreview,
      },
      { status: 502 },
    );
  }
}
