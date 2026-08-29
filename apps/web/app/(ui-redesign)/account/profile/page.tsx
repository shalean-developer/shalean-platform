"use client";

import Link from "next/link";
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
import { useReferralSummary } from "@/hooks/useReferralSummary";
import { HelpCard } from "@/components/account/HelpCard";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { useDashboardToast } from "@/components/dashboard/dashboard-toast-context";

function initialsFromName(name: string | undefined, email: string | undefined): string {
  const n = (name?.trim() || email?.split("@")[0] || "?").trim();
  const parts = n.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
  return n.slice(0, 2).toUpperCase() || "?";
}

function ProfileStat({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: string | number;
  label: string;
}) {
  return (
    <Card className="min-w-0">
      <CardContent className="p-4 text-center">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          {icon}
        </div>
        <p className="mt-2 text-xl font-bold text-foreground">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}

export default function AccountProfilePage() {
  const toast = useDashboardToast();
  const { user, loading: userLoading } = useUser();
  const { bookings, loading: bookLoading } = useBookings();
  const { addresses } = useAddresses();
  const { reviews } = useReviews();
  const { data: referralData } = useReferralSummary();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [preferredContact, setPreferredContact] = useState<"whatsapp" | "email" | "phone">("whatsapp");
  const [pwNew, setPwNew] = useState("");
  const [busy, setBusy] = useState(false);
  const [profileLoading, setProfileLoading] = useState(true);
  const [dateOfBirth, setDateOfBirth] = useState("");

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
      const { data: profile } = await sb
        .from("user_profiles")
        .select("full_name, phone, date_of_birth")
        .eq("id", user.id)
        .maybeSingle();
      if (!cancelled) {
        setName((profile?.full_name as string | undefined)?.trim() || meta?.full_name?.trim() || "");
        if (profile?.phone) setPhone(String(profile.phone));
        if (profile?.date_of_birth) {
          setDateOfBirth(String(profile.date_of_birth).slice(0, 10));
        }
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
      date_of_birth: dateOfBirth.trim() || null,
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
      <div className="space-y-6" aria-hidden>
        <div className="h-8 w-40 animate-pulse rounded-lg bg-muted" />
        <div className="h-40 animate-pulse rounded-2xl border border-border bg-card" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-28 animate-pulse rounded-2xl border border-border bg-card" />
          ))}
        </div>
        <div className="h-72 animate-pulse rounded-2xl border border-border bg-card" />
      </div>
    );
  }

  if (!user) return null;

  const displayName = name || email?.split("@")[0] || "Account";

  return (
    <div className="space-y-8 pb-8">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Profile</h1>
        <p className="mt-1 text-sm text-muted-foreground">Your account details, contact info, and security settings.</p>
      </header>

      <Card className="overflow-hidden border-primary/20 bg-primary text-primary-foreground">
        <CardContent className="p-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <Avatar className="h-20 w-20 shrink-0 border-4 border-primary-foreground/30 shadow-[var(--ui-shadow-sm)]">
              <AvatarFallback className="bg-primary-foreground/15 text-2xl font-bold text-primary-foreground">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="break-words text-2xl font-bold">{displayName}</p>
              <p className="mt-0.5 break-all text-sm text-primary-foreground/80">{email}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-foreground/15 px-3 py-1 text-xs font-semibold">
                  <CalendarDays className="h-3.5 w-3.5" aria-hidden />
                  {bookLoading ? "—" : `${bookings.length} booking${bookings.length !== 1 ? "s" : ""}`}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-foreground/15 px-3 py-1 text-xs font-semibold">
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                  {bookLoading ? "—" : `${completedBookings} completed`}
                </span>
                {avgRating ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-foreground/15 px-3 py-1 text-xs font-semibold">
                    <Star className="h-3.5 w-3.5" aria-hidden />
                    {avgRating} avg rating
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <section aria-label="Account overview" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <ProfileStat
          icon={<CalendarDays className="h-5 w-5" strokeWidth={1.75} aria-hidden />}
          value={bookLoading ? "—" : bookings.length}
          label="Total bookings"
        />
        <ProfileStat
          icon={<CheckCircle2 className="h-5 w-5" strokeWidth={1.75} aria-hidden />}
          value={bookLoading ? "—" : completedBookings}
          label="Completed"
        />
        <ProfileStat
          icon={<Star className="h-5 w-5" strokeWidth={1.75} aria-hidden />}
          value={reviews.length > 0 ? avgRating ?? "—" : "—"}
          label="Avg. rating"
        />
        <ProfileStat
          icon={<MapPin className="h-5 w-5" strokeWidth={1.75} aria-hidden />}
          value={addresses.length}
          label="Properties"
        />
      </section>

      {primaryAddress ? (
        <Card>
          <CardHeader className="border-b border-border pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <BookOpen className="h-4 w-4" strokeWidth={1.75} aria-hidden />
              </div>
              <CardTitle className="text-base">Primary property</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="pt-5">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <MapPin className="h-5 w-5" strokeWidth={1.75} aria-hidden />
              </div>
              <div className="min-w-0">
                <p className="break-words font-medium text-foreground">{primaryAddress.label || "Home"}</p>
                <p className="break-words text-sm text-muted-foreground">{primaryAddress.line1}</p>
                <p className="break-words text-sm text-muted-foreground">
                  {primaryAddress.suburb}, {primaryAddress.city} {primaryAddress.postal_code}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <form onSubmit={(e) => void onSave(e)} className="space-y-6">
        <Card>
          <CardHeader className="border-b border-border pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <User className="h-4 w-4" strokeWidth={1.75} aria-hidden />
              </div>
              <CardTitle className="text-base">Personal information</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 pt-5">
            <FormField label="Full name" htmlFor="profile-name">
              <Input
                id="profile-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                placeholder="Your full name"
              />
            </FormField>

            <FormField
              label="Email address"
              htmlFor="profile-email"
              helperText="Email address cannot be changed here. Contact support for help."
            >
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input
                  id="profile-email"
                  type="email"
                  value={email}
                  disabled
                  readOnly
                  className="bg-muted/50 pl-9 text-muted-foreground"
                />
              </div>
            </FormField>

            <FormField
              label="Date of birth"
              htmlFor="profile-dob"
              helperText="Used for your birthday Cleaning Credit (optional)."
            >
              <Input
                id="profile-dob"
                type="date"
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
              />
            </FormField>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Phone number" htmlFor="profile-phone">
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
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
              </FormField>
              <FormField label="WhatsApp number" htmlFor="profile-whatsapp">
                <div className="relative">
                  <MessageCircle className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary" aria-hidden />
                  <Input
                    id="profile-whatsapp"
                    type="tel"
                    value={whatsapp}
                    onChange={(e) => setWhatsapp(e.target.value)}
                    placeholder="+27 82 000 0000"
                    className="pl-9"
                  />
                </div>
              </FormField>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b border-border pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <MessageCircle className="h-4 w-4" strokeWidth={1.75} aria-hidden />
              </div>
              <CardTitle className="text-base">Preferred contact method</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="pt-5">
            <div className="flex flex-wrap gap-3" role="group" aria-label="Preferred contact method">
              {(["whatsapp", "email", "phone"] as const).map((opt) => (
                <Button
                  key={opt}
                  type="button"
                  variant={preferredContact === opt ? "default" : "outline"}
                  className="rounded-xl"
                  aria-pressed={preferredContact === opt}
                  onClick={() => setPreferredContact(opt)}
                >
                  {opt === "whatsapp" ? (
                    <MessageCircle className="h-4 w-4" aria-hidden />
                  ) : opt === "email" ? (
                    <Mail className="h-4 w-4" aria-hidden />
                  ) : (
                    <Phone className="h-4 w-4" aria-hidden />
                  )}
                  {opt === "whatsapp" ? "WhatsApp" : opt === "email" ? "Email" : "Phone call"}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b border-border pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Gift className="h-4 w-4" strokeWidth={1.75} aria-hidden />
              </div>
              <CardTitle className="text-base">Referrals &amp; rewards</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="pt-5">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: "Total referrals", value: referralData?.totalReferrals ?? 0 },
                { label: "Successful", value: referralData?.successfulReferrals ?? 0 },
                { label: "Available credit", value: `R ${(referralData?.creditBalance ?? 0).toLocaleString("en-ZA")}` },
                { label: "Credit used", value: `R ${(referralData?.creditUsed ?? 0).toLocaleString("en-ZA")}` },
              ].map((s) => (
                <div key={s.label} className="min-w-0 rounded-xl border border-border bg-muted/40 px-3 py-2.5">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{s.label}</p>
                  <p className="mt-0.5 break-words text-lg font-bold text-foreground">{s.value}</p>
                </div>
              ))}
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              Invite friends and earn Cleaning Credit on future bookings.{" "}
              <Link
                href="/account/referrals"
                className="font-semibold text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                View referrals →
              </Link>
              {" · "}
              <Link
                href="/refer"
                className="font-semibold text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                Refer a friend
              </Link>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b border-border pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
                <Shield className="h-4 w-4" strokeWidth={1.75} aria-hidden />
              </div>
              <CardTitle className="text-base">Password &amp; security</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 pt-5">
            <p className="text-xs text-muted-foreground">Leave blank to keep your current password.</p>
            <FormField label="New password" htmlFor="pw-new" helperText="Minimum 6 characters.">
              <div className="relative">
                <KeyRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <PasswordInput
                  id="pw-new"
                  value={pwNew}
                  onChange={(e) => setPwNew(e.target.value)}
                  autoComplete="new-password"
                  className="pl-9"
                />
              </div>
            </FormField>
          </CardContent>
        </Card>

        <Button type="submit" size="lg" className="w-full rounded-xl sm:w-auto sm:px-8" disabled={busy}>
          {busy ? "Saving…" : "Save changes"}
        </Button>
      </form>

      <HelpCard />
    </div>
  );
}
