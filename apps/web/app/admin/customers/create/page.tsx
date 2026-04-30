"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function AdminCreateCustomerPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const p = searchParams.get("phone")?.trim() ?? "";
    const fn = searchParams.get("full_name")?.trim() ?? "";
    if (p) setPhone(p);
    if (fn) setFullName(fn);
  }, [searchParams]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const sb = getSupabaseBrowser();
      const token = (await sb?.auth.getSession())?.data.session?.access_token;
      if (!token) {
        setError("You are not signed in. Open admin login and try again.");
        return;
      }
      const res = await fetch("/api/admin/customers", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: fullName.trim(),
          phone: phone.trim(),
          email: email.trim() || undefined,
          address: address.trim() || undefined,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        user_id?: string;
        reused?: boolean;
        match?: string;
        email?: string;
      };
      if (!res.ok) {
        setError(typeof json.error === "string" ? json.error : "Request failed.");
        return;
      }
      const uid = typeof json.user_id === "string" ? json.user_id : "";
      if (!uid) {
        setError("Unexpected response.");
        return;
      }
      router.push(`/admin/customers/${uid}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <div className="mb-4 flex items-center justify-between gap-3">
        <Link href="/admin/customers" className="text-sm font-medium text-blue-600 hover:underline dark:text-blue-400">
          ← Customers
        </Link>
        <Link
          href="/admin/bookings/create"
          className="text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
        >
          Create booking
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Create customer</CardTitle>
          <CardDescription>
            Walk-ins and offline leads get a real Shalean account (Auth + profile). Without an email, login uses a
            stable address derived from the phone.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="full_name">
                Full name <span className="text-red-600">*</span>
              </Label>
              <Input
                id="full_name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                disabled={busy}
                autoComplete="name"
                required
                minLength={2}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">
                Phone <span className="text-red-600">*</span>
              </Label>
              <Input
                id="phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={busy}
                autoComplete="tel"
                placeholder="082 … or +27 …"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email (optional)</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={busy}
                autoComplete="email"
                placeholder="Leave blank to use phone-based login"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="address">Address (optional)</Label>
              <textarea
                id="address"
                rows={3}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                disabled={busy}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm focus-visible:outline focus-visible:ring-2 focus-visible:ring-zinc-400 dark:border-zinc-600 dark:bg-zinc-950"
                placeholder="Saved as the customer’s default property"
              />
            </div>
            {error ? (
              <p className="text-sm text-red-600 dark:text-red-400" role="alert">
                {error}
              </p>
            ) : null}
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Create customer"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
