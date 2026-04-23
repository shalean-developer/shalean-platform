"use client";

import { useEffect, useState, type FormEvent } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useUser } from "@/hooks/useUser";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useDashboardToast } from "@/components/dashboard/dashboard-toast-context";
import { DashboardPageSkeleton } from "@/components/dashboard/dashboard-skeletons";

export default function DashboardProfilePage() {
  const toast = useDashboardToast();
  const { user, loading: userLoading } = useUser();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNew, setPwNew] = useState("");
  const [busy, setBusy] = useState(false);
  const [profileLoading, setProfileLoading] = useState(true);

  useEffect(() => {
    if (userLoading || !user) {
      if (!userLoading && !user) setProfileLoading(false);
      return;
    }
    const sb = getSupabaseClient();
    if (!sb) {
      setProfileLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      setEmail(user.email ?? "");
      const meta = user.user_metadata as { full_name?: string; phone?: string };
      setPhone(meta?.phone ?? "");
      const { data } = await sb.from("user_profiles").select("full_name").eq("id", user.id).maybeSingle();
      if (!cancelled) {
        const fn = (data as { full_name?: string | null } | null)?.full_name?.trim();
        setName(fn || meta?.full_name || "");
        setProfileLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, userLoading]);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    const sb = getSupabaseClient();
    if (!sb) {
      toast("Supabase is not configured.", "error");
      return;
    }
    setBusy(true);
    const now = new Date().toISOString();
    const { data: existing } = await sb.from("user_profiles").select("id").eq("id", user.id).maybeSingle();
    const pErr = existing
      ? (
          await sb
            .from("user_profiles")
            .update({ full_name: name.trim() || null, updated_at: now })
            .eq("id", user.id)
        ).error
      : (
          await sb.from("user_profiles").insert({
            id: user.id,
            full_name: name.trim() || null,
            tier: "regular",
            booking_count: 0,
            total_spent_cents: 0,
            updated_at: now,
          })
        ).error;
    if (pErr) {
      toast(pErr.message, "error");
      setBusy(false);
      return;
    }
    const { error: uErr } = await sb.auth.updateUser({
      data: { full_name: name.trim(), phone: phone.trim() || undefined },
    });
    if (uErr) {
      toast(uErr.message, "error");
      setBusy(false);
      return;
    }
    if (pwNew.trim()) {
      if (pwNew.trim().length < 6) {
        toast("New password must be at least 6 characters.", "error");
        setBusy(false);
        return;
      }
      const { error: pwErr } = await sb.auth.updateUser({ password: pwNew.trim() });
      if (pwErr) {
        toast(pwErr.message, "error");
        setBusy(false);
        return;
      }
      setPwCurrent("");
      setPwNew("");
    }
    setBusy(false);
    toast("Profile saved.", "success");
  }

  if (userLoading || profileLoading) {
    return <DashboardPageSkeleton />;
  }

  if (!user) {
    return null;
  }

  return (
    <div>
      <PageHeader title="Profile" description="Your contact details and password." />

      <form onSubmit={(e) => void onSave(e)} className="space-y-6">
        <Card className="rounded-2xl border-zinc-200/80 shadow-md dark:border-zinc-800 dark:bg-zinc-900">
          <CardHeader>
            <CardTitle className="text-base">Personal information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="profile-name">Name</Label>
              <Input id="profile-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="profile-email">Email</Label>
              <Input id="profile-email" type="email" value={email} disabled readOnly className="bg-zinc-50 dark:bg-zinc-800" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="profile-phone">Phone</Label>
              <Input id="profile-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" />
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-zinc-200/80 shadow-md dark:border-zinc-800 dark:bg-zinc-900">
          <CardHeader>
            <CardTitle className="text-base">Change password</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-zinc-500">Leave blank to keep your current password. Supabase may require a recent login for password changes.</p>
            <div className="space-y-1.5">
              <Label htmlFor="pw-current">Current password (optional)</Label>
              <Input id="pw-current" type="password" value={pwCurrent} onChange={(e) => setPwCurrent(e.target.value)} autoComplete="current-password" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pw-new">New password</Label>
              <Input id="pw-new" type="password" value={pwNew} onChange={(e) => setPwNew(e.target.value)} autoComplete="new-password" />
            </div>
          </CardContent>
        </Card>

        <Separator className="opacity-0" />

        <Button type="submit" size="lg" className="min-h-12 w-full rounded-2xl sm:w-auto" disabled={busy}>
          {busy ? "Saving…" : "Save changes"}
        </Button>
      </form>
    </div>
  );
}
