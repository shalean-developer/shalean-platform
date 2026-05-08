import { NextResponse } from "next/server";
import { sendSavedQuoteRecoveryEmail } from "@/lib/email/sendBookingEmail";
import { getPublicAppUrlBase } from "@/lib/email/appUrl";
import { logSystemEvent } from "@/lib/logging/systemLog";

export const runtime = "nodejs";

function stringField(value: unknown, max = 500): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function safeContinueUrl(raw: unknown): string | null {
  const base = getPublicAppUrlBase().replace(/\/$/, "");
  const value = stringField(raw, 2000);
  if (!value) return null;
  if (value.startsWith("/")) return `${base}${value}`;
  try {
    const parsed = new URL(value);
    const app = new URL(base);
    if (parsed.origin !== app.origin) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function safeWhatsappUrl(raw: unknown): string | null {
  const value = stringField(raw, 2000);
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:") return null;
    if (parsed.hostname !== "wa.me" && parsed.hostname !== "api.whatsapp.com") return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const customerEmail = stringField(body.email, 320);
  const continueUrl = safeContinueUrl(body.continueUrl);
  const serviceLabel = stringField(body.serviceLabel, 120) || "Cleaning";
  const quoteLabel = stringField(body.quoteLabel, 180) || null;
  const firstName = stringField(body.firstName, 80) || null;
  const whatsappUrl = safeWhatsappUrl(body.whatsappUrl);

  if (!customerEmail || !customerEmail.includes("@")) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  if (!continueUrl) {
    return NextResponse.json({ error: "Could not save this recovery link." }, { status: 400 });
  }

  const result = await sendSavedQuoteRecoveryEmail({
    customerEmail,
    firstName,
    continueUrl,
    serviceLabel,
    quoteLabel,
    whatsappUrl,
  });

  await logSystemEvent({
    level: result.sent ? "info" : "warn",
    source: "booking_recovery_capture",
    message: result.sent ? "saved_quote_email_sent" : "saved_quote_email_failed",
    context: {
      serviceLabel,
      step: stringField(body.step, 40),
      booking_session_id: stringField(body.bookingSessionId, 80),
      error: result.error ?? null,
    },
  });

  if (!result.sent) {
    return NextResponse.json({ error: result.error ?? "Could not send recovery email." }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
