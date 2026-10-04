import { NextResponse } from "next/server";
import {
  contactFormTopicLabel,
  isContactFormTopic,
} from "@/lib/contact/contactFormContract";
import { sendInternalContactFormEmail } from "@/lib/contact/sendInternalContactFormEmail";
import { checkContactFormRateLimit } from "@/lib/rateLimit/contactFormRateLimit";

const MAX_NAME = 120;
const MAX_EMAIL = 254;
const MAX_PHONE = 40;
const MAX_MESSAGE = 5000;

function clean(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function validEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function POST(request: Request) {
  const limit = checkContactFormRateLimit(request);
  if (!limit.allowed) {
    return NextResponse.json(
      { ok: false, error: "Too many messages. Please wait a few minutes and try again." },
      {
        status: 429,
        headers: { "Retry-After": String(limit.retryAfterSeconds) },
      },
    );
  }

  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }
  const body = parsed as Record<string, unknown>;

  // Honeypot: real users never see or populate this field.
  if (clean(body.company, 200)) {
    return NextResponse.json({ ok: true });
  }

  const name = clean(body.name, MAX_NAME);
  const email = clean(body.email, MAX_EMAIL).toLowerCase();
  const phone = clean(body.phone, MAX_PHONE);
  const message = clean(body.message, MAX_MESSAGE);
  const topic = body.topic;

  if (!name || !email || !message || !isContactFormTopic(topic)) {
    return NextResponse.json(
      { ok: false, error: "Please complete all required fields." },
      { status: 400 },
    );
  }

  if (!validEmail(email)) {
    return NextResponse.json({ ok: false, error: "Enter a valid email address." }, { status: 400 });
  }

  const topicLabel = contactFormTopicLabel(topic);
  const subject = `Website contact: ${topicLabel} — ${name}`;
  const text = [
    `Name: ${name}`,
    `Email: ${email}`,
    phone ? `Phone: ${phone}` : null,
    `Topic: ${topicLabel}`,
    "",
    message,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;color:#111827">
      <h2 style="margin-bottom:16px">New website contact enquiry</h2>
      <p><strong>Name:</strong> ${escapeHtml(name)}</p>
      <p><strong>Email:</strong> ${escapeHtml(email)}</p>
      ${phone ? `<p><strong>Phone:</strong> ${escapeHtml(phone)}</p>` : ""}
      <p><strong>Topic:</strong> ${escapeHtml(topicLabel)}</p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0" />
      <p style="white-space:pre-wrap">${escapeHtml(message)}</p>
    </div>
  `;

  const result = await sendInternalContactFormEmail({
    replyTo: email,
    subject,
    text,
    html,
  });

  if (!result.sent) {
    console.error("[contact-form] send failed", {
      error: result.error ?? "unknown_error",
      topic,
    });
    return NextResponse.json(
      { ok: false, error: "We could not send your message right now. Please try again." },
      { status: 503 },
    );
  }

  return NextResponse.json({ ok: true });
}
