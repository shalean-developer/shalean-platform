"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Gift,
  KeyRound,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Shield,
  Star,
  User,
} from "lucide-react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import {
  billingEmailFromLoginEmail,
  mapPreferredContactToNotificationChannel,
  normalizeCustomerProfileContactFields,
} from "@/lib/customer/customerProfileContactFields";
import { normalizeSouthAfricaPhone } from "@/lib/utils/phone";
import { useUser } from "@/hooks/useUser";
import { useBookings } from "@/hooks/useBookings";
import { useAddresses } from "@/hooks/useAddresses";
import { useReviews } from "@/hooks/useReviews";
import { HelpCard } from "@/components/account/HelpCard";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { useDashboardToast } from "@/components/dashboard/dashboard-toast-context";

function initialsFromName(name: string | undefined, email: string | undefined): string {
  const n = (name?.trim() || email?.split("@")[0] || "?").trim();
  const parts = n.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
  return n.slice(0, 2).toUpperCase() || "?";
}

export default function AccountProfilePage() {
  const toast = useDashboardToast();
  const { user, loading: userLoading } = useUser();
  const { bookings, loading: bookLoading } = useBookings();
  const { addresses } = useAddresses();
  const { reviews } = useReviews();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [preferredContact, setPreferredContact] = useState<"whatsapp" | "email" | "phone">("whatsapp");
  const [pwNew, setPwNew] = useState("");
  const [busy, setBusy] = useState(false);
  const [profileLoading, setProfileLoading] = useState(true);

  const meta = user?.user_metadata as { full_name?: string; phone?: string; whatsapp?: string; preferred_contact?: string } | undefined;
  const initials = initialsFromName(meta?.full_name, user?.email);

  const completedBookings = bookings.filter((b) => b.status?.toLowerCase().includes("complet")).length;
  const primaryAddress = addresses.find((a) => a.is_default) ?? addresses[0];
  const avgRating = reviews.length > 0 ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1) : null;

  useEffect(() => {
    if (userLoading || !user) {
      if (!userLoading && !user) setProfileLoading(false);
      return;
    }
    const sb = getSupabaseClient();
    if (!sb) { setProfileLoading(false); return; }
    let cancelled = false;
    void (async () => {
      setEmail(user.email ?? "");
      setPhone(meta?.phone ?? "");
      setWhatsapp(meta?.whatsapp ?? meta?.phone ?? "");
      setPreferredContact((meta?.preferred_contact as typeof preferredContact | undefined) ?? "whatsapp");
      if (!cancelled) {
        setName(meta?.full_name?.trim() || "");
        setProfileLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user, userLoading, meta?.full_name, meta?.phone, meta?.preferred_contact, meta?.whatsapp]);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    const sb = getSupabaseClient();
    if (!sb) { toast("Supabase is not configured.", "error"); return; }
    setBusy(true);
    const now = new Date().toISOString();
    const { error: uErr } = await sb.auth.updateUser({
      data: {
        full_name: name.trim(),
        phone: phone.trim() || undefined,
        whatsapp: whatsapp.trim() || undefined,
        preferred_contact: preferredContact,
      },
    });
    if (uErr) { toast(uErr.message, "error"); setBusy(false); return; }
    const phoneE164 = phone.trim() ? normalizeSouthAfricaPhone(phone.trim()) : null;
    const contact = normalizeCustomerProfileContactFields({
      fullName: name.trim(),
      billingEmail: billingEmailFromLoginEmail(user.email ?? email.trim()),
      phone: phoneE164 ?? (phone.trim() || null),
      preferredNotificationChannel: mapPreferredContactToNotificationChannel(preferredContact),
    });
    const { data: existing } = await sb.from("user_profiles").select("id").eq("id", user.id).maybeSingle();
    const profilePatch = {
      updated_at: now,
      ...(contact.full_name ? { full_name: contact.full_name } : {}),
      ...(contact.billing_email ? { billing_email: contact.billing_email } : {}),
      ...(contact.phone ? { phone: contact.phone } : {}),
      ...(contact.phone_e164 ? { phone_e164: contact.phone_e164 } : {}),
      ...(contact.preferred_notification_channel
        ? { preferred_notification_channel: contact.preferred_notification_channel }
        : {}),
    };
    const pErr = existing
      ? (await sb.from("user_profiles").update(profilePatch).eq("id", user.id)).error
      : (
          await sb.from("user_profiles").insert({
            id: user.id,
            tier: "regular",
            role: "customer",
            booking_count: 0,
            total_spent_cents: 0,
            ...profilePatch,
          })
        ).error;
    if (pErr) { toast(pErr.message, "error"); setBusy(false); return; }
    if (pwNew.trim()) {
      if (pwNew.trim().length < 6) { toast("New password must be at least 6 characters.", "error"); setBusy(false); return; }
      const { error: pwErr } = await sb.auth.updateUser({ password: pwNew.trim() });
      if (pwErr) { toast(pwErr.message, "error"); setBusy(false); return; }
      setPwNew("");
    }
    setBusy(false);
    toast("Profile saved successfully.", "success");
  }

  if (userLoading || profileLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-32 rounded-2xl bg-gray-100" />
        <div className="h-64 rounded-2xl bg-gray-100" />
        <div className="h-40 rounded-2xl bg-gray-100" />
      </div>
    );
  }

  if (!user) return null;

  const displayName = name || email?.split("@")[0] || "Account";

  return (
    <div className="space-y-8 pb-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Profile</h1>
        <p className="mt-1 text-sm text-gray-500">Your account details, contact info, and security settings.</p>
      </div>

      {/* Profile summary hero */}
      <div className="overflow-hidden rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-600 to-blue-700 p-6 text-white shadow-lg">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <Avatar className="h-20 w-20 shrink-0 border-4 border-white/30 shadow-xl">
            <AvatarFallback className="bg-white/20 text-2xl font-bold text-white backdrop-blur">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-2xl font-bold">{displayName}</p>
            <p className="mt-0.5 text-sm text-blue-100">{email}</p>
            <div className="mt-3 flex flex-wrap gap-3">
              <div className="flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold backdrop-blur">
                <CalendarDays className="h-3.5 w-3.5" />
                {bookLoading ? "—" : `${bookings.length} booking${bookings.length !== 1 ? "s" : ""}`}
              </div>
              <div className="flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold backdrop-blur">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {bookLoading ? "—" : `${completedBookings} completed`}
              </div>
              {avgRating ? (
                <div className="flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold backdrop-blur">
                  <Star className="h-3.5 w-3.5" />
                  {avgRating} avg rating
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {/* Quick overview cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 mx-auto">
            <CalendarDays className="h-5 w-5 text-blue-600" strokeWidth={1.75} />
          </div>
          <p className="mt-2 text-xl font-bold text-gray-900">{bookLoading ? "—" : bookings.length}</p>
          <p className="text-xs text-gray-500">Total bookings</p>
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-100 mx-auto">
            <CheckCircle2 className="h-5 w-5 text-green-600" strokeWidth={1.75} />
          </div>
          <p className="mt-2 text-xl font-bold text-gray-900">{bookLoading ? "—" : completedBookings}</p>
          <p className="text-xs text-gray-500">Completed</p>
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 mx-auto">
            <Star className="h-5 w-5 text-amber-600" strokeWidth={1.75} />
          </div>
          <p className="mt-2 text-xl font-bold text-gray-900">{reviews.length > 0 ? avgRating : "—"}</p>
          <p className="text-xs text-gray-500">Avg. rating</p>
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 mx-auto">
            <MapPin className="h-5 w-5 text-violet-600" strokeWidth={1.75} />
          </div>
          <p className="mt-2 text-xl font-bold text-gray-900">{addresses.length}</p>
          <p className="text-xs text-gray-500">Properties</p>
        </div>
      </div>

      {/* Primary property preview */}
      {primaryAddress ? (
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50">
              <BookOpen className="h-4 w-4 text-blue-600" strokeWidth={1.75} />
            </div>
            <h2 className="text-sm font-semibold text-gray-900">Primary property</h2>
          </div>
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-100">
              <MapPin className="h-5 w-5 text-blue-600" strokeWidth={1.75} />
            </div>
            <div>
              <p className="font-medium text-gray-900">{primaryAddress.label || "Home"}</p>
              <p className="text-sm text-gray-500">{primaryAddress.line1}</p>
              <p className="text-sm text-gray-500">{primaryAddress.suburb}, {primaryAddress.city} {primaryAddress.postal_code}</p>
            </div>
          </div>
        </div>
      ) : null}

      {/* Edit form */}
      <form onSubmit={(e) => void onSave(e)} className="space-y-6">
        {/* Personal information */}
        <div className="rounded-2xl border border-gray-100 bg-white shadow-sm">
          <div className="flex items-center gap-3 border-b border-gray-100 px-5 py-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50">
              <User className="h-4 w-4 text-blue-600" strokeWidth={1.75} />
            </div>
            <h2 className="text-sm font-semibold text-gray-900">Personal information</h2>
          </div>
          <div className="space-y-4 p-5">
            <div className="space-y-1.5">
              <Label htmlFor="profile-name">Full name</Label>
              <Input
                id="profile-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                placeholder="Your full name"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="profile-email">Email address</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <Input
                  id="profile-email"
                  type="email"
                  value={email}
                  disabled
                  readOnly
                  className="bg-gray-50 pl-9 text-gray-500"
                />
              </div>
              <p className="text-xs text-gray-400">Email address cannot be changed here. Contact support for help.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="profile-phone">Phone number</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <Input
                    id="profile-phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    autoComplete="tel"
                    placeholder="+27 82 000 0000"
                    className="pl-9"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="profile-whatsapp">WhatsApp number</Label>
                <div className="relative">
                  <MessageCircle className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-green-500" />
                  <Input
                    id="profile-whatsapp"
                    type="tel"
                    value={whatsapp}
                    onChange={(e) => setWhatsapp(e.target.value)}
                    placeholder="+27 82 000 0000"
                    className="pl-9"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Preferred contact */}
        <div className="rounded-2xl border border-gray-100 bg-white shadow-sm">
          <div className="flex items-center gap-3 border-b border-gray-100 px-5 py-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-green-50">
              <MessageCircle className="h-4 w-4 text-green-600" strokeWidth={1.75} />
            </div>
            <h2 className="text-sm font-semibold text-gray-900">Preferred contact method</h2>
          </div>
          <div className="flex flex-wrap gap-3 p-5">
            {(["whatsapp", "email", "phone"] as const).map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => setPreferredContact(opt)}
                className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition ${
                  preferredContact === opt
                    ? "border-blue-200 bg-blue-50 text-blue-700"
                    : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                {opt === "whatsapp" ? <MessageCircle className="h-4 w-4" /> : opt === "email" ? <Mail className="h-4 w-4" /> : <Phone className="h-4 w-4" />}
                {opt === "whatsapp" ? "WhatsApp" : opt === "email" ? "Email" : "Phone call"}
              </button>
            ))}
          </div>
        </div>

        {/* Referrals summary */}
        <div className="rounded-2xl border border-gray-100 bg-white shadow-sm">
          <div className="flex items-center gap-3 border-b border-gray-100 px-5 py-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-50">
              <Gift className="h-4 w-4 text-violet-600" strokeWidth={1.75} />
            </div>
            <h2 className="text-sm font-semibold text-gray-900">Referrals &amp; rewards</h2>
          </div>
          <div className="p-5">
            <p className="text-sm text-gray-500">
              Invite friends and earn discounts on future cleans.{" "}
              <a href="/account/referrals" className="font-semibold text-blue-600 hover:underline">
                View your referral page →
              </a>
            </p>
          </div>
        </div>

        {/* Password & security */}
        <div className="rounded-2xl border border-gray-100 bg-white shadow-sm">
          <div className="flex items-center gap-3 border-b border-gray-100 px-5 py-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-50">
              <Shield className="h-4 w-4 text-red-600" strokeWidth={1.75} />
            </div>
            <h2 className="text-sm font-semibold text-gray-900">Password &amp; security</h2>
          </div>
          <div className="space-y-4 p-5">
            <p className="text-xs text-gray-400">Leave blank to keep your current password.</p>
            <div className="space-y-1.5">
              <Label htmlFor="pw-new">New password</Label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <PasswordInput
                  id="pw-new"
                  value={pwNew}
                  onChange={(e) => setPwNew(e.target.value)}
                  autoComplete="new-password"
                  className="pl-9"
                />
              </div>
              <p className="text-xs text-gray-400">Minimum 6 characters.</p>
            </div>
          </div>
        </div>

        <Button
          type="submit"
          size="lg"
          className="w-full rounded-2xl bg-blue-600 text-white hover:bg-blue-700 sm:w-auto px-8"
          disabled={busy}
        >
          {busy ? "Saving…" : "Save changes"}
        </Button>
      </form>

      {/* Help */}
      <HelpCard />
    </div>
  );
}
