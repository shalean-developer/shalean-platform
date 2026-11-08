"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Camera, Check, Eye, EyeOff, KeyRound } from "lucide-react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useUser } from "@/hooks/useUser";
import { useCustomerAvatar } from "@/hooks/useCustomerAvatar";
import { CUSTOMER_AVATAR_MAX_BYTES } from "@/lib/customer/customerAvatar";
import { billingEmailFromLoginEmail } from "@/lib/customer/customerProfileContactFields";
import { profileDetailsPatch, validateProfileDetails, type ProfileDetails, type ProfileErrors } from "@/lib/customer/customerProfileForm";
import { MarketingEmailPreferences } from "@/components/account/MarketingEmailPreferences";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDashboardToast } from "@/components/dashboard/dashboard-toast-context";

const emptyDetails: ProfileDetails = { name: "", phone: "", whatsapp: "", dateOfBirth: "", preferredContact: "email" };
const panel = "rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6";
const control = "bg-muted/40 shadow-none";

export default function AccountProfilePage() {
  const toast = useDashboardToast();
  const { user, loading: userLoading } = useUser();
  const userId = user?.id;
  const userRef = useRef(user);
  useEffect(() => { userRef.current = user; }, [user]);
  const avatarPhoto = useCustomerAvatar(user);
  const hasPhoto = Boolean(avatarPhoto || user?.user_metadata?.customer_avatar_path);
  const photoInput = useRef<HTMLInputElement>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoMessage, setPhotoMessage] = useState("");
  const [photoError, setPhotoError] = useState(false);
  const [details, setDetails] = useState<ProfileDetails>(emptyDetails);
  const [savedDetails, setSavedDetails] = useState<ProfileDetails>(emptyDetails);
  const [errors, setErrors] = useState<ProfileErrors>({});
  const [busy, setBusy] = useState(false);
  const [profileLoading, setProfileLoading] = useState(true);
  const [loadedUserId, setLoadedUserId] = useState<string>();
  const [loadError, setLoadError] = useState("");
  const [retry, setRetry] = useState(0);
  const [saveMessage, setSaveMessage] = useState("");
  const [saveError, setSaveError] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordError, setPasswordError] = useState(false);
  const dirty = JSON.stringify(details) !== JSON.stringify(savedDetails);
  const today = new Date().toLocaleDateString("en-CA");
  const initials = (savedDetails.name || user?.user_metadata?.full_name || user?.email || "?")
    .trim().split(/\s+/).map((part: string) => part[0]).filter(Boolean);
  const initialsText = initials.length > 1 ? `${initials[0]}${initials[initials.length - 1]}`.toUpperCase() : (initials[0] || "?").toUpperCase();

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const viewer = userRef.current;
    void (async () => {
      try {
        const sb = getSupabaseClient();
        if (!sb) throw new Error("Account connection unavailable.");
        const { data: profile, error } = await sb.from("user_profiles")
          .select("full_name, phone, phone_e164, date_of_birth, preferred_notification_channel")
          .eq("id", userId).maybeSingle();
        if (error || !profile) throw new Error("Your details could not be loaded. Please try again.");
        const meta = viewer?.user_metadata ?? {};
        const phone = profile.phone_e164 ?? profile.phone ?? meta.phone ?? "";
        const preferred = profile.preferred_notification_channel;
        const contact = preferred === "sms" ? "phone" : preferred === "whatsapp" || preferred === "email" ? preferred
          : ["whatsapp", "email", "phone"].includes(meta.preferred_contact) ? meta.preferred_contact : "email";
        const loaded: ProfileDetails = {
          name: profile.full_name?.trim() || meta.full_name || "",
          phone,
          whatsapp: typeof meta.whatsapp === "string" ? meta.whatsapp : phone,
          dateOfBirth: profile.date_of_birth?.slice(0, 10) || "",
          preferredContact: contact,
        };
        if (!cancelled) { setDetails(loaded); setSavedDetails(loaded); setErrors({}); setSaveMessage(""); }
      } catch (error) {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : "Your details could not be loaded.");
      } finally { if (!cancelled) { setProfileLoading(false); setLoadedUserId(userId); } }
    })();
    return () => { cancelled = true; };
  }, [userId, retry]); // Auth/photo refreshes must not overwrite unsaved contact edits.

  function change<K extends keyof ProfileDetails>(key: K, value: ProfileDetails[K]) {
    setDetails(previous => ({ ...previous, [key]: value }));
    setErrors(previous => ({ ...previous, [key]: undefined }));
    setSaveMessage("");
  }

  async function savePhoto(file?: File) {
    const sb = getSupabaseClient();
    if (!sb || !user || photoBusy) return;
    setPhotoMessage(""); setPhotoError(false);
    if (file && (file.size > CUSTOMER_AVATAR_MAX_BYTES || !["image/jpeg", "image/png", "image/webp"].includes(file.type))) {
      setPhotoError(true); setPhotoMessage("Choose a JPG, PNG or WebP photo up to 2 MB."); return;
    }
    setPhotoBusy(true);
    try {
      const { data } = await sb.auth.getSession();
      if (!data.session) throw new Error("Please sign in again.");
      const body = file ? new FormData() : undefined;
      if (file) body!.append("file", file);
      const response = await fetch("/api/customer/avatar", {
        method: file ? "POST" : "DELETE", headers: { Authorization: `Bearer ${data.session.access_token}` }, body,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Your photo could not be saved.");
      const refreshed = await sb.auth.refreshSession();
      if (refreshed.error) throw new Error("Photo saved. Reload the page to update your profile picture.");
      const message = file ? "Profile photo updated." : "Profile photo removed.";
      setPhotoMessage(message); toast(message, "success");
    } catch (error) {
      setPhotoError(true); setPhotoMessage(error instanceof Error ? error.message : "Your photo could not be saved.");
    } finally { setPhotoBusy(false); }
  }

  async function onSave(event: FormEvent) {
    event.preventDefault();
    if (!user || busy || !dirty || loadError) return;
    const invalid = validateProfileDetails(details, today);
    setErrors(invalid);
    if (Object.keys(invalid).length) {
      document.getElementById(`profile-${Object.keys(invalid)[0]}`)?.focus();
      return;
    }
    setBusy(true); setSaveMessage(""); setSaveError(false);
    try {
      const sb = getSupabaseClient();
      if (!sb) throw new Error("Account connection unavailable. Please try again.");
      const patch = profileDetailsPatch(details);
      const billingEmail = billingEmailFromLoginEmail(user.email);
      const { data, error } = await sb.from("user_profiles").update({
        ...patch, ...(billingEmail ? { billing_email: billingEmail } : {}), updated_at: new Date().toISOString(),
      }).eq("id", user.id).select("id").single();
      if (error || !data) throw new Error("Your details could not be saved. Please try again.");
      // Explicit nulls clear database numbers; explicit empty metadata clears legacy fallbacks.
      const { error: metadataError } = await sb.auth.updateUser({ data: {
        full_name: patch.full_name, phone: patch.phone || "",
        whatsapp: details.whatsapp.trim() ? profileDetailsPatch({ ...details, phone: details.whatsapp }).phone : "",
        preferred_contact: details.preferredContact,
      } });
      if (metadataError) throw new Error("Your account details were saved, but contact syncing failed. Select Save changes to retry.");
      const saved = { ...details, name: patch.full_name, phone: patch.phone || "", whatsapp: details.whatsapp.trim() ? profileDetailsPatch({ ...details, phone: details.whatsapp }).phone || "" : "" };
      setDetails(saved); setSavedDetails(saved); setSaveMessage("Your details have been saved.");
      toast("Your details have been saved.", "success");
    } catch (error) {
      setSaveError(true); setSaveMessage(error instanceof Error ? error.message : "Your details could not be saved. Please try again.");
    } finally { setBusy(false); }
  }

  async function updatePassword(event: FormEvent) {
    event.preventDefault();
    if (passwordBusy) return;
    setPasswordMessage(""); setPasswordError(false);
    if (password.length < 6 || password !== confirmation) {
      setPasswordError(true); setPasswordMessage(password.length < 6 ? "Use at least 6 characters." : "The passwords do not match."); return;
    }
    setPasswordBusy(true);
    try {
      const sb = getSupabaseClient();
      if (!sb) throw new Error("Account connection unavailable.");
      const { error } = await sb.auth.updateUser({ password });
      if (error) throw new Error(error.message);
      setPassword(""); setConfirmation(""); setPasswordOpen(false);
      setPasswordMessage("Your password has been updated.");
    } catch (error) {
      setPasswordError(true); setPasswordMessage(error instanceof Error ? error.message : "Your password could not be updated.");
    } finally { setPasswordBusy(false); }
  }

  if (userLoading || (user && (profileLoading || loadedUserId !== userId))) return (
    <div role="status" aria-label="Loading profile" className="mx-auto max-w-5xl space-y-5">
      <span className="sr-only">Loading your profile…</span>
      <div className="h-9 w-48 animate-pulse rounded-lg bg-muted" />
      <div className="h-80 animate-pulse rounded-2xl bg-muted" />
    </div>
  );
  if (!user) return null;
  if (loadError) return (
    <div className={`${panel} mx-auto max-w-5xl space-y-4`}>
      <h1 className="text-2xl font-bold text-[#00205b]">My profile</h1>
      <p role="alert">{loadError}</p>
      <Button onClick={() => { setProfileLoading(true); setLoadError(""); setRetry(value => value + 1); }}>Try again</Button>
    </div>
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#00205b] sm:text-3xl">My profile</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage your details and preferences.</p>
        </div>
        <Link href="/account/help" className="text-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4">Need help?</Link>
      </header>

      <section className={panel} aria-labelledby="details-title">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h2 id="details-title" className="text-lg font-semibold text-[#00205b]">My details</h2>
          <Button variant="outline" type="button" aria-expanded={passwordOpen} aria-controls="profile-password" onClick={() => { setPasswordOpen(!passwordOpen); setPassword(""); setConfirmation(""); setPasswordMessage(""); }} disabled={passwordBusy}>
            <KeyRound className="h-4 w-4" aria-hidden />{passwordOpen ? "Close password form" : "Update password"}
          </Button>
        </div>
        <form onSubmit={event => void onSave(event)} noValidate>
          <fieldset disabled={busy} className="grid min-w-0 gap-x-6 gap-y-5 sm:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="profile-name" className="text-sm font-medium">Full name</label>
              <Input id="profile-name" value={details.name} onChange={e => change("name", e.target.value)} autoComplete="name" required maxLength={120} className={control} aria-invalid={!!errors.name} aria-describedby={errors.name ? "profile-name-error" : undefined} />
              {errors.name && <p id="profile-name-error" className="text-sm text-destructive" role="alert">{errors.name}</p>}
            </div>
            <div className="space-y-2">
              <label htmlFor="profile-email" className="text-sm font-medium">Email address</label>
              <Input id="profile-email" type="email" value={user.email || ""} readOnly className={`${control} text-muted-foreground`} aria-describedby="profile-email-help" />
              <p id="profile-email-help" className="text-xs text-muted-foreground">Contact support to change your sign-in email.</p>
            </div>
            {(["phone", "whatsapp"] as const).map(field => (
              <div key={field} className="space-y-2">
                <label htmlFor={`profile-${field}`} className="text-sm font-medium">{field === "phone" ? "Phone number" : "WhatsApp number"}</label>
                <Input id={`profile-${field}`} type="tel" inputMode="tel" autoComplete={field === "phone" ? "tel" : "off"} value={details[field]} onChange={e => change(field, e.target.value)} placeholder="082 123 4567" className={control} aria-invalid={!!errors[field]} aria-describedby={errors[field] ? `profile-${field}-error` : undefined} />
                {errors[field] && <p id={`profile-${field}-error`} className="text-sm text-destructive" role="alert">{errors[field]}</p>}
              </div>
            ))}
            <div className="space-y-2">
              <label htmlFor="profile-dateOfBirth" className="text-sm font-medium">Date of birth <span className="font-normal text-muted-foreground">(optional)</span></label>
              <Input id="profile-dateOfBirth" type="date" value={details.dateOfBirth} onChange={e => change("dateOfBirth", e.target.value)} min="1900-01-01" max={today} autoComplete="bday" className={control} aria-invalid={!!errors.dateOfBirth} aria-describedby={errors.dateOfBirth ? "profile-dateOfBirth-error" : "profile-birthday-help"} />
              <p id="profile-birthday-help" className="text-xs text-muted-foreground">For your birthday Cleaning Credit.</p>
              {errors.dateOfBirth && <p id="profile-dateOfBirth-error" role="alert" className="text-sm text-destructive">{errors.dateOfBirth}</p>}
            </div>
            <fieldset className="min-w-0 space-y-2">
              <legend className="mb-2 text-sm font-medium">Preferred contact method</legend>
              <div className="flex flex-wrap gap-2">
                {(["whatsapp", "email", "phone"] as const).map(option => (
                  <label key={option} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary ${details.preferredContact === option ? "border-primary bg-primary/5 text-primary" : "border-border"}`}>
                    <input type="radio" name="preferred-contact" value={option} checked={details.preferredContact === option} onChange={() => change("preferredContact", option)} className="accent-primary" />
                    {option === "whatsapp" ? "WhatsApp" : option === "email" ? "Email" : "Phone"}
                  </label>
                ))}
              </div>
            </fieldset>
          </fieldset>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
            <p className={`text-sm ${saveError ? "text-destructive" : "text-muted-foreground"}`} role={saveError ? "alert" : "status"}>
              {saveMessage || (dirty ? "You have unsaved changes." : "Your details are up to date.")}
            </p>
            <Button type="submit" disabled={busy || !dirty} className="w-full sm:w-auto sm:px-6">{!busy && !dirty && <Check className="h-4 w-4" aria-hidden />}{busy ? "Saving…" : "Save changes"}</Button>
          </div>
        </form>
        {passwordOpen && <form id="profile-password" onSubmit={event => void updatePassword(event)} className="mt-6 space-y-4 border-t border-border pt-5">
          <h3 className="font-semibold text-[#00205b]">Update password</h3>
          <fieldset disabled={passwordBusy} className="grid min-w-0 gap-4 sm:grid-cols-2">
            <div className="space-y-2"><label htmlFor="profile-password-new" className="text-sm font-medium">New password</label>
              <Input id="profile-password-new" type={showPassword ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" required minLength={6} aria-describedby="profile-password-help" className={control} />
            </div>
            <div className="space-y-2"><label htmlFor="profile-password-confirm" className="text-sm font-medium">Confirm new password</label>
              <Input id="profile-password-confirm" type={showPassword ? "text" : "password"} value={confirmation} onChange={e => setConfirmation(e.target.value)} autoComplete="new-password" required minLength={6} className={control} />
            </div>
          </fieldset>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p id="profile-password-help" className="text-xs text-muted-foreground">Use at least 6 characters.</p>
            <Button type="button" variant="ghost" aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}{showPassword ? "Hide passwords" : "Show passwords"}</Button>
          </div>
          <Button type="submit" disabled={passwordBusy}>{passwordBusy ? "Updating…" : "Save password"}</Button>
        </form>}
        {passwordMessage && <p className={`mt-3 text-sm ${passwordError ? "text-destructive" : "text-foreground"}`} role={passwordError ? "alert" : "status"}>{passwordMessage}</p>}
      </section>

      <section className={panel} aria-labelledby="photo-title">
        <h2 id="photo-title" className="text-lg font-semibold text-[#00205b]">Profile photo</h2>
        <p className="mt-1 text-sm text-muted-foreground">Choose the photo shown on your Shalean account.</p>
        <div className="mt-5 flex flex-col gap-4 min-[400px]:flex-row min-[400px]:items-center">
          <Avatar className="h-16 w-16 shrink-0 border border-border"><AvatarImage src={avatarPhoto} alt="Your profile photo" className="object-cover" referrerPolicy="no-referrer" /><AvatarFallback className="bg-primary/10 text-xl font-semibold text-primary">{initialsText}</AvatarFallback></Avatar>
          <div className="min-w-0 space-y-2">
            <input ref={photoInput} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" aria-label="Choose profile photo" disabled={photoBusy} onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void savePhoto(file); }} />
            <div className="flex flex-wrap gap-2">
              <Button type="button" disabled={photoBusy} onClick={() => photoInput.current?.click()}><Camera className="h-4 w-4" aria-hidden />{photoBusy ? "Updating…" : hasPhoto ? "Change photo" : "Upload photo"}</Button>
              {hasPhoto && <Button variant="outline" type="button" disabled={photoBusy} onClick={() => void savePhoto()}>Remove photo</Button>}
            </div>
            <p className="text-xs text-muted-foreground">JPG, PNG or WebP · Max 2 MB. Photos save automatically.</p>
          </div>
        </div>
        {photoMessage && <p className={`mt-3 text-sm ${photoError ? "text-destructive" : "text-foreground"}`} role={photoError ? "alert" : "status"}>{photoMessage}</p>}
      </section>
      <MarketingEmailPreferences />
    </div>
  );
}
