import {
  mapPreferredContactToNotificationChannel,
  normalizeCustomerProfileContactFields,
} from "@shalean/utils";
import type { CustomerProfileDto } from "@/services/types/customerAccount";
import { getRefreshToken } from "@/lib/storage/tokenStorage";
import { createCustomerUserSupabase } from "@/lib/profile/customerUserSupabase";

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

/** Load profile via RLS + auth user (mirrors server loadCustomerProfileDto). */
export async function loadCustomerProfileViaSupabase(
  accessToken: string,
  userId: string,
  email: string | null,
): Promise<CustomerProfileDto> {
  const client = createCustomerUserSupabase(accessToken);
  const { data: userData, error: userErr } = await client.auth.getUser(accessToken);
  if (userErr || !userData.user?.id || userData.user.id !== userId) {
    throw new Error(userErr?.message || "Invalid or expired session.");
  }

  const meta = (userData.user.user_metadata ?? {}) as Record<string, unknown>;
  const { data: row } = await client
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

  return {
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
      (preferredFromMeta === "whatsapp" ||
      preferredFromMeta === "email" ||
      preferredFromMeta === "phone"
        ? preferredFromMeta
        : null),
    preferredNotificationChannel:
      channel === "whatsapp" || channel === "sms" || channel === "email" ? channel : null,
    dateOfBirth: typeof r.date_of_birth === "string" ? r.date_of_birth : null,
    billingEmail: typeof r.billing_email === "string" ? r.billing_email : null,
    tier: typeof r.tier === "string" ? r.tier : null,
  };
}

export type CustomerProfilePatchInput = {
  fullName?: string;
  phone?: string;
  whatsapp?: string;
  preferredContact?: "whatsapp" | "email" | "phone";
  dateOfBirth?: string | null;
};

/** Patch profile via auth metadata + RLS upsert (mirrors server applyCustomerProfilePatch). */
export async function applyCustomerProfilePatchViaSupabase(
  accessToken: string,
  userId: string,
  patch: CustomerProfilePatchInput,
): Promise<void> {
  const client = createCustomerUserSupabase(accessToken);
  const refresh = await getRefreshToken();
  if (refresh) {
    const { error: sessionErr } = await client.auth.setSession({
      access_token: accessToken,
      refresh_token: refresh,
    });
    if (sessionErr) {
      throw new Error(sessionErr.message || "Could not restore session for profile update.");
    }
  }

  const channel = mapPreferredContactToNotificationChannel(patch.preferredContact);
  const normalized = normalizeCustomerProfileContactFields({
    fullName: patch.fullName,
    phone: patch.phone,
    preferredNotificationChannel: channel,
  });

  const meta: Record<string, string> = {};
  if (normalized.full_name) meta.full_name = normalized.full_name;
  if (normalized.phone) meta.phone = normalized.phone;
  if (typeof patch.whatsapp === "string") meta.whatsapp = patch.whatsapp;
  if (patch.preferredContact) meta.preferred_contact = patch.preferredContact;

  if (Object.keys(meta).length > 0) {
    const { error: authErr } = await client.auth.updateUser({ data: meta });
    if (authErr) {
      throw new Error(authErr.message || "Could not update account.");
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
      throw new Error("dateOfBirth must be YYYY-MM-DD.");
    }
  }

  if (Object.keys(profilePatch).length === 0 && Object.keys(meta).length === 0) {
    throw new Error("No profile fields to update.");
  }

  if (Object.keys(profilePatch).length === 0) return;

  const { data: existing } = await client
    .from("user_profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();

  if (existing) {
    const { error } = await client.from("user_profiles").update(profilePatch).eq("id", userId);
    if (error) throw new Error(error.message);
    return;
  }

  const { error } = await client.from("user_profiles").insert({
    id: userId,
    role: "customer",
    tier: "regular",
    booking_count: 0,
    total_spent_cents: 0,
    ...profilePatch,
  });
  if (error) throw new Error(error.message);
}
