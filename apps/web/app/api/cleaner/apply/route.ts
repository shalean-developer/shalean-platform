import { NextResponse } from "next/server";
import {
  normalizeCleanerApplyWorkingAreas,
  normalizeCleanerApplyWorkingDays,
} from "@/lib/cleaner/cleanerApplicationFields";
import {
  CLEANER_APPLICATION_ALREADY_CLEANER_MESSAGE,
  CLEANER_APPLICATION_DUPLICATE_MESSAGE,
  normalizeCleanerApplicationPhone,
} from "@/lib/cleaner/cleanerApplicationPhone";
import { createPendingCleanerReferral } from "@/lib/referrals/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { southAfricaPhoneLookupVariants } from "@/lib/utils/phone";

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
    workingAreas?: string[];
    workingDays?: string[];
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
  const workingAreas = normalizeCleanerApplyWorkingAreas(body.workingAreas);
  const workingDays = normalizeCleanerApplyWorkingDays(body.workingDays);

  const allowedExperience = new Set(["None", "1–2 years", "3+ years"]);
  if (name.length < 2 || phone.length < 6 || cityIdRaw.length < 2 || location.length < 2) {
    return NextResponse.json({ error: "Name, phone, city, and location are required." }, { status: 400 });
  }
  if (workingAreas.length === 0) {
    return NextResponse.json({ error: "Select at least one working area." }, { status: 400 });
  }
  if (workingDays.length === 0) {
    return NextResponse.json({ error: "Select at least one working day." }, { status: 400 });
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

  const { data: cityLocations, error: locErr } = await admin
    .from("locations")
    .select("name")
    .eq("city_id", cityId);
  if (locErr) return NextResponse.json({ error: locErr.message }, { status: 500 });
  const allowedAreaNames = new Set(
    (cityLocations ?? []).map((row) => String((row as { name?: string }).name ?? "").trim().toLowerCase()).filter(Boolean),
  );
  const invalidAreas = workingAreas.filter((area) => !allowedAreaNames.has(area.toLowerCase()));
  if (allowedAreaNames.size > 0 && invalidAreas.length > 0) {
    return NextResponse.json({ error: "One or more working areas are invalid for the selected city." }, { status: 400 });
  }

  const phoneNormalized = normalizeCleanerApplicationPhone(phone);
  if (phoneNormalized.length < 6) {
    return NextResponse.json({ error: "Please enter a valid phone number." }, { status: 400 });
  }

  const { data: existingApplication, error: existingErr } = await admin
    .from("cleaner_applications")
    .select("id, status")
    .eq("phone_normalized", phoneNormalized)
    .in("status", ["pending", "approved"])
    .maybeSingle();
  if (existingErr) return NextResponse.json({ error: existingErr.message }, { status: 500 });
  if (existingApplication) {
    return NextResponse.json({ error: "duplicate_application", message: CLEANER_APPLICATION_DUPLICATE_MESSAGE }, { status: 409 });
  }

  const phoneVariants = [...new Set(southAfricaPhoneLookupVariants(phone))].filter(Boolean);
  if (phoneVariants.length > 0) {
    const { data: byPhone, error: byPhoneErr } = await admin
      .from("cleaners")
      .select("id")
      .in("phone", phoneVariants)
      .limit(1);
    if (byPhoneErr) return NextResponse.json({ error: byPhoneErr.message }, { status: 500 });

    const { data: byPhoneNumber, error: byPhoneNumberErr } = await admin
      .from("cleaners")
      .select("id")
      .in("phone_number", phoneVariants)
      .limit(1);
    if (byPhoneNumberErr) return NextResponse.json({ error: byPhoneNumberErr.message }, { status: 500 });

    if ((byPhone?.length ?? 0) > 0 || (byPhoneNumber?.length ?? 0) > 0) {
      return NextResponse.json(
        { error: "already_cleaner", message: CLEANER_APPLICATION_ALREADY_CLEANER_MESSAGE },
        { status: 409 },
      );
    }
  }

  const { error } = await admin.from("cleaner_applications").insert({
    name,
    phone,
    phone_normalized: phoneNormalized,
    location,
    experience: experience || null,
    availability,
    working_areas: workingAreas,
    working_days: workingDays,
    city_id: cityId,
    status: "pending",
  });
  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "duplicate_application", message: CLEANER_APPLICATION_DUPLICATE_MESSAGE }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (referralCode) {
    await createPendingCleanerReferral({
      admin,
      refCode: referralCode,
      referredPhone: phone,
    });
  }

  return NextResponse.json({ ok: true });
}
