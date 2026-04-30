import crypto from "crypto";

import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { findAuthUserIdByEmail } from "@/lib/cleaner/linkCleanerAuth";
import { customerGeneratedLoginEmailFromAnyPhone } from "@/lib/customer/customerIdentity";
import { isAdmin } from "@/lib/auth/admin";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { normalizeEmail } from "@/lib/booking/normalizeEmail";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { normalizeSouthAfricaPhone } from "@/lib/utils/phone";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type BookingRow = {
  customer_email: string | null;
  total_paid_zar: number | null;
  amount_paid_cents: number | null;
  created_at: string;
};

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!token) return NextResponse.json({ error: "Missing authorization." }, { status: 401 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const pub = createClient(url, anon);
  const {
    data: { user },
  } = await pub.auth.getUser(token);
  if (!user?.email || !isAdmin(user.email)) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const { data, error } = await admin
    .from("bookings")
    .select("customer_email, total_paid_zar, amount_paid_cents, created_at")
    .order("created_at", { ascending: false })
    .limit(5000);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const byEmail = new Map<string, { totalBookings: number; totalSpendZar: number; lastBookingAt: string | null }>();
  for (const r of (data ?? []) as BookingRow[]) {
    const email = r.customer_email?.trim().toLowerCase();
    if (!email) continue;
    const paid =
      typeof r.total_paid_zar === "number" ? r.total_paid_zar : Math.round((r.amount_paid_cents ?? 0) / 100);
    const cur = byEmail.get(email) ?? { totalBookings: 0, totalSpendZar: 0, lastBookingAt: null };
    cur.totalBookings += 1;
    cur.totalSpendZar += paid;
    if (!cur.lastBookingAt || r.created_at > cur.lastBookingAt) cur.lastBookingAt = r.created_at;
    byEmail.set(email, cur);
  }

  const now = Date.now();
  const customers = [...byEmail.entries()].map(([email, v]) => {
    const recentMs = v.lastBookingAt ? now - new Date(v.lastBookingAt).getTime() : Number.MAX_SAFE_INTEGER;
    return {
      email,
      totalBookings: v.totalBookings,
      totalSpendZar: v.totalSpendZar,
      lastBookingAt: v.lastBookingAt,
      status: recentMs <= 1000 * 60 * 60 * 24 * 90 ? "active" : "inactive",
    };
  });

  return NextResponse.json({ customers });
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
    return NextResponse.json({
      ok: true,
      reused: true,
      match: "phone",
      user_id: uidByPhone,
      email: genEmail,
    });
  }
  if (uidByEmail) {
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
        return NextResponse.json({ ok: true, reused: true, match: "race", user_id: uid, email: loginEmail });
      }
    }
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const userId = created.data.user.id;

  const { error: profErr } = await admin.from("user_profiles").upsert(
    {
      id: userId,
      full_name: fullName,
      tier: "regular",
      billing_type: "per_booking",
      schedule_type: "on_demand",
      booking_count: 0,
      total_spent_cents: 0,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );

  if (profErr) {
    await admin.auth.admin.deleteUser(userId).catch(() => {});
    return NextResponse.json({ error: profErr.message }, { status: 500 });
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
