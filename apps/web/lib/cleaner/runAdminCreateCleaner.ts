import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createCleaner } from "@/lib/cleaner/createCleaner";
import { normalizeSouthAfricaPhone, southAfricaPhoneLookupVariants } from "@/lib/utils/phone";

export type AdminCreateCleanerBody = {
  fullName: string;
  phone: string;
  password: string;
  email?: string | null;
  cityId?: string | null;
  location?: string | null;
  availabilityStart?: string | null;
  availabilityEnd?: string | null;
  isAvailable?: boolean;
};

export async function runAdminCreateCleaner(
  admin: SupabaseClient,
  body: AdminCreateCleanerBody,
): Promise<{ cleanerId: string; email: string }> {
  const fullName = String(body.fullName ?? "").trim();
  const phone = String(body.phone ?? "").trim();
  const password = String(body.password ?? "");
  const email = (body.email ?? "").toString().trim() || null;

  if (!fullName || !phone) {
    throw new Error("Full name and phone are required.");
  }
  if (!normalizeSouthAfricaPhone(phone)) {
    throw new Error("Invalid South Africa phone number.");
  }
  if (password.length < 6) {
    throw new Error("Password must be at least 6 characters.");
  }

  const phoneLookup = southAfricaPhoneLookupVariants(phone);
  const { data: existingRows, error: existingPhoneErr } = await admin
    .from("cleaners")
    .select("id")
    .in("phone", phoneLookup)
    .limit(1);
  if (existingPhoneErr) throw new Error(existingPhoneErr.message);
  if (existingRows?.length) throw new Error("Phone number already exists.");

  const numberCheck = await admin.from("cleaners").select("id").in("phone_number", phoneLookup).limit(1);
  if (!numberCheck.error && numberCheck.data?.length) {
    throw new Error("Phone number already exists.");
  }

  const created = await createCleaner({
    admin,
    email,
    password,
    fullName,
    phone,
    cityId: body.cityId?.trim() || null,
    location: body.location?.trim() || null,
    availabilityStart: body.availabilityStart?.trim() || null,
    availabilityEnd: body.availabilityEnd?.trim() || null,
    isAvailable: body.isAvailable ?? true,
  });
  return { cleanerId: created.cleanerId, email: created.email };
}
