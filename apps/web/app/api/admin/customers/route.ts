import crypto from "crypto";

import { NextResponse } from "next/server";
import { ensureUserProfileForAuthUser } from "@/lib/admin/ensureUserProfileForAuthUser";
import { loadAdminCustomersList } from "@/lib/admin/loadAdminCustomersList";
import { findAuthUserIdByEmail } from "@/lib/cleaner/linkCleanerAuth";
import { customerGeneratedLoginEmailFromAnyPhone } from "@/lib/customer/customerIdentity";
import { upsertCustomerProfileContact } from "@/lib/customer/upsertCustomerProfileContact";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { normalizeEmail } from "@/lib/booking/normalizeEmail";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { normalizeSouthAfricaPhone } from "@/lib/utils/phone";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  try {
    const rows = await loadAdminCustomersList(admin);
    const customers = rows.map((c) => ({
      ...c,
      totalBookings: c.total_bookings,
      totalSpendZar: c.total_spend_zar,
      lastBookingAt: c.last_booking_at,
    }));
    return NextResponse.json({ customers });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Admin: create a customer account (Auth + `user_profiles`) for walk-ins / WhatsApp leads.
 * Dedupes by normalised SA phone (synthetic `@walkin.shalean.com` login) or by supplied email.
 */
export async function POST(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: Record<string, unknown>;
  try {
    const raw = await request.json();
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }
    body = raw as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const fullName = typeof body.full_name === "string" ? body.full_name.trim() : "";
  const phoneRaw = typeof body.phone === "string" ? body.phone.trim() : "";
  const emailRaw = typeof body.email === "string" ? body.email.trim() : "";
  const address = typeof body.address === "string" ? body.address.trim().slice(0, 500) : "";

  if (fullName.length < 2) {
    return NextResponse.json({ error: "Full name must be at least 2 characters." }, { status: 400 });
  }
  if (phoneRaw.length < 5) {
    return NextResponse.json({ error: "Phone is required (at least 5 characters)." }, { status: 400 });
  }
  const phoneNorm = normalizeSouthAfricaPhone(phoneRaw);
  if (!phoneNorm) {
    return NextResponse.json({ error: "Enter a valid South Africa phone number (e.g. 082… or +27…)." }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const genEmail = customerGeneratedLoginEmailFromAnyPhone(phoneNorm);
  if (!genEmail) {
    return NextResponse.json({ error: "Could not derive login from phone." }, { status: 400 });
  }

  const emailNorm = emailRaw ? normalizeEmail(emailRaw) : "";
  if (emailRaw && !EMAIL_RE.test(emailNorm)) {
    return NextResponse.json({ error: "Invalid email address." }, { status: 400 });
  }

  const uidByPhone = await findAuthUserIdByEmail(admin, genEmail);
  const uidByEmail = emailNorm ? await findAuthUserIdByEmail(admin, emailNorm) : null;
  if (uidByPhone && uidByEmail && uidByPhone !== uidByEmail) {
    return NextResponse.json(
      {
        error:
          "This phone already belongs to one account and the email to another. Resolve in Auth before continuing.",
      },
      { status: 409 },
    );
  }
  if (uidByPhone) {
    await ensureUserProfileForAuthUser(admin, uidByPhone);
    await upsertCustomerProfileContact(admin, {
      userId: uidByPhone,
      contact: { fullName, billingEmail: emailNorm || null, phone: phoneNorm },
    });
    return NextResponse.json({
      ok: true,
      reused: true,
      match: "phone",
      user_id: uidByPhone,
      email: genEmail,
    });
  }
  if (uidByEmail) {
    await ensureUserProfileForAuthUser(admin, uidByEmail);
    await upsertCustomerProfileContact(admin, {
      userId: uidByEmail,
      contact: { fullName, billingEmail: emailNorm, phone: phoneNorm },
    });
    return NextResponse.json({
      ok: true,
      reused: true,
      match: "email",
      user_id: uidByEmail,
      email: emailNorm,
    });
  }

  const loginEmail = emailNorm || genEmail;
  const tempPassword = `${crypto.randomBytes(18).toString("base64url")}Aa1!`;

  const created = await admin.auth.admin.createUser({
    email: loginEmail,
    password: tempPassword,
    email_confirm: true,
    user_metadata: {
      full_name: fullName,
      phone: phoneNorm,
      source: "admin_create_customer",
    },
  });

  if (created.error || !created.data.user?.id) {
    const msg = created.error?.message ?? "createUser failed";
    if (msg.toLowerCase().includes("already")) {
      const uid = await findAuthUserIdByEmail(admin, loginEmail);
      if (uid) {
        // Race: pre-check missed the user (e.g. RPC briefly unavailable);
        // ensure profile exists before returning success.
        await ensureUserProfileForAuthUser(admin, uid);
        return NextResponse.json({ ok: true, reused: true, match: "race", user_id: uid, email: loginEmail });
      }
    }
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const userId = created.data.user.id;

  const contactResult = await upsertCustomerProfileContact(admin, {
    userId,
    contact: {
      fullName,
      billingEmail: emailNorm || null,
      phone: phoneNorm,
    },
    role: "customer",
  });

  if (!contactResult.ok) {
    await admin.auth.admin.deleteUser(userId).catch(() => {});
    return NextResponse.json({ error: contactResult.error }, { status: 500 });
  }

  if (address.length > 0) {
    const { error: addrErr } = await admin.from("customer_saved_addresses").insert({
      user_id: userId,
      label: "Primary",
      line1: address,
      suburb: "",
      city: "Cape Town",
      postal_code: "",
      is_default: true,
    });
    if (addrErr) {
      /* Non-fatal — account exists */
    }
  }

  return NextResponse.json({
    ok: true,
    reused: false,
    user_id: userId,
    email: loginEmail,
  });
}
