import type { SupabaseClient } from "@supabase/supabase-js";
import {
  mapPreferredContactToNotificationChannel,
  normalizeCustomerProfileContactFields,
} from "@shalean/utils";
import { createClient } from "@supabase/supabase-js";

export type CustomerProfileDto = {
  id: string;
  email: string | null;
  fullName: string | null;
  phone: string | null;
  whatsapp: string | null;
  preferredContact: "whatsapp" | "email" | "phone" | null;
  preferredNotificationChannel: "whatsapp" | "sms" | "email" | null;
  dateOfBirth: string | null;
  billingEmail: string | null;
  tier: string | null;
};

function channelToPreferredContact(
  channel: string | null | undefined,
): "whatsapp" | "email" | "phone" | null {
  const v = String(channel ?? "")
    .trim()
    .toLowerCase();
  if (v === "whatsapp") return "whatsapp";
  if (v === "email") return "email";
  if (v === "sms" || v === "phone") return "phone";
  return null;
}

function metaString(meta: Record<string, unknown>, key: string): string | null {
  const v = meta[key];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

export async function loadCustomerProfileDto(
  admin: SupabaseClient,
  userId: string,
  email: string | null,
  accessToken: string,
): Promise<{ ok: true; profile: CustomerProfileDto } | { ok: false; error: string; status: number }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return { ok: false, error: "Server configuration error.", status: 503 };
  }

  const pub = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
  const { data: userData, error: userErr } = await pub.auth.getUser(accessToken);
  if (userErr || !userData.user?.id || userData.user.id !== userId) {
    return { ok: false, error: "Invalid or expired session.", status: 401 };
  }

  const meta = (userData.user.user_metadata ?? {}) as Record<string, unknown>;
  const { data: row } = await admin
    .from("user_profiles")
    .select(
      "id, full_name, phone, phone_e164, billing_email, preferred_notification_channel, date_of_birth, tier",
    )
    .eq("id", userId)
    .maybeSingle();

  const r = (row ?? {}) as Record<string, unknown>;
  const channel =
    typeof r.preferred_notification_channel === "string"
      ? r.preferred_notification_channel
      : null;
  const preferredFromMeta = metaString(meta, "preferred_contact");

  const profile: CustomerProfileDto = {
    id: userId,
    email: email ?? (typeof userData.user.email === "string" ? userData.user.email : null),
    fullName:
      (typeof r.full_name === "string" && r.full_name.trim()) ||
      metaString(meta, "full_name") ||
      null,
    phone:
      (typeof r.phone === "string" && r.phone.trim()) ||
      (typeof r.phone_e164 === "string" && r.phone_e164.trim()) ||
      metaString(meta, "phone") ||
      null,
    whatsapp: metaString(meta, "whatsapp"),
    preferredContact:
      channelToPreferredContact(channel) ??
      (preferredFromMeta === "whatsapp" || preferredFromMeta === "email" || preferredFromMeta === "phone"
        ? preferredFromMeta
        : null),
    preferredNotificationChannel:
      channel === "whatsapp" || channel === "sms" || channel === "email" ? channel : null,
    dateOfBirth: typeof r.date_of_birth === "string" ? r.date_of_birth : null,
    billingEmail: typeof r.billing_email === "string" ? r.billing_email : null,
    tier: typeof r.tier === "string" ? r.tier : null,
  };

  return { ok: true, profile };
}

export type CustomerProfilePatchBody = {
  fullName?: string;
  phone?: string;
  whatsapp?: string;
  preferredContact?: "whatsapp" | "email" | "phone";
  dateOfBirth?: string | null;
};

export function parseCustomerProfilePatchBody(body: Record<string, unknown>): CustomerProfilePatchBody {
  const out: CustomerProfilePatchBody = {};
  if (typeof body.fullName === "string") out.fullName = body.fullName.trim();
  else if (typeof body.full_name === "string") out.fullName = body.full_name.trim();
  if (typeof body.phone === "string") out.phone = body.phone.trim();
  if (typeof body.whatsapp === "string") out.whatsapp = body.whatsapp.trim();
  const pref = body.preferredContact ?? body.preferred_contact;
  if (pref === "whatsapp" || pref === "email" || pref === "phone") out.preferredContact = pref;
  if (body.dateOfBirth === null || body.date_of_birth === null) out.dateOfBirth = null;
  else if (typeof body.dateOfBirth === "string") out.dateOfBirth = body.dateOfBirth.trim() || null;
  else if (typeof body.date_of_birth === "string") out.dateOfBirth = body.date_of_birth.trim() || null;
  return out;
}

export async function applyCustomerProfilePatch(
  admin: SupabaseClient,
  userId: string,
  accessToken: string,
  patch: CustomerProfilePatchBody,
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return { ok: false, error: "Server configuration error.", status: 503 };
  }

  const channel = mapPreferredContactToNotificationChannel(patch.preferredContact);
  const normalized = normalizeCustomerProfileContactFields({
    fullName: patch.fullName,
    phone: patch.phone,
    preferredNotificationChannel: channel,
  });

  const pub = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });

  const meta: Record<string, string> = {};
  if (normalized.full_name) meta.full_name = normalized.full_name;
  if (normalized.phone) meta.phone = normalized.phone;
  if (typeof patch.whatsapp === "string") meta.whatsapp = patch.whatsapp;
  if (patch.preferredContact) meta.preferred_contact = patch.preferredContact;

  if (Object.keys(meta).length > 0) {
    const { error: authErr } = await pub.auth.updateUser({ data: meta });
    if (authErr) {
      return { ok: false, error: authErr.message || "Could not update account.", status: 400 };
    }
  }

  const profilePatch: Record<string, unknown> = {};
  if (normalized.full_name) profilePatch.full_name = normalized.full_name;
  if (normalized.phone !== undefined) profilePatch.phone = normalized.phone;
  if (normalized.phone_e164 !== undefined) profilePatch.phone_e164 = normalized.phone_e164;
  if (normalized.preferred_notification_channel) {
    profilePatch.preferred_notification_channel = normalized.preferred_notification_channel;
  }
  if (patch.dateOfBirth !== undefined) {
    if (patch.dateOfBirth === null) profilePatch.date_of_birth = null;
    else if (/^\d{4}-\d{2}-\d{2}$/.test(patch.dateOfBirth)) {
      profilePatch.date_of_birth = patch.dateOfBirth;
    } else {
      return { ok: false, error: "dateOfBirth must be YYYY-MM-DD.", status: 400 };
    }
  }

  if (Object.keys(profilePatch).length === 0 && Object.keys(meta).length === 0) {
    return { ok: false, error: "No profile fields to update.", status: 400 };
  }

  if (Object.keys(profilePatch).length > 0) {
    const { data: existing } = await admin.from("user_profiles").select("id").eq("id", userId).maybeSingle();
    if (existing) {
      const { error } = await admin.from("user_profiles").update(profilePatch).eq("id", userId);
      if (error) return { ok: false, error: error.message, status: 500 };
    } else {
      const { error } = await admin.from("user_profiles").insert({
        id: userId,
        role: "customer",
        tier: "regular",
        booking_count: 0,
        total_spent_cents: 0,
        ...profilePatch,
      });
      if (error) return { ok: false, error: error.message, status: 500 };
    }
  }

  return { ok: true };
}
