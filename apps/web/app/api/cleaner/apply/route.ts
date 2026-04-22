import { NextResponse } from "next/server";
import { createPendingCleanerReferral } from "@/lib/referrals/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  let body: {
    name?: string;
    phone?: string;
    cityId?: string;
    location?: string;
    experience?: string;
    availability?: string[];
    referralCode?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const name = String(body.name ?? "").trim();
  const phone = String(body.phone ?? "").trim();
  const cityIdRaw = String(body.cityId ?? "").trim();
  const location = String(body.location ?? "").trim();
  const experience = String(body.experience ?? "").trim();
  const rawAvailability = Array.isArray(body.availability) ? body.availability : [];
  const referralCode = String(body.referralCode ?? "").trim().toUpperCase();
  const availability = rawAvailability
    .map((item) => String(item ?? "").trim())
    .filter(Boolean)
    .slice(0, 8);

  const allowedExperience = new Set(["None", "1–2 years", "3+ years"]);
  if (name.length < 2 || phone.length < 6 || cityIdRaw.length < 2 || location.length < 2) {
    return NextResponse.json({ error: "Name, phone, city, and location are required." }, { status: 400 });
  }
  if (experience && !allowedExperience.has(experience)) {
    return NextResponse.json({ error: "Invalid experience option." }, { status: 400 });
  }

  let cityId: string | null = null;
  const { data: cityById } = await admin.from("cities").select("id").eq("id", cityIdRaw).maybeSingle();
  if (cityById?.id) {
    cityId = cityById.id;
  } else {
    const { data: cityBySlug } = await admin.from("cities").select("id").eq("slug", cityIdRaw).maybeSingle();
    cityId = cityBySlug?.id ?? null;
  }
  if (!cityId) {
    return NextResponse.json({ error: "Invalid city." }, { status: 400 });
  }

  const { error } = await admin.from("cleaner_applications").insert({
    name,
    phone,
    location,
    experience: experience || null,
    availability,
    city_id: cityId,
    status: "pending",
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (referralCode) {
    await createPendingCleanerReferral({
      admin,
      refCode: referralCode,
      referredPhone: phone,
    });
  }

  return NextResponse.json({ ok: true });
}
