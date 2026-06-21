"use client";

import Link from "next/link";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type CustomerDetail = {
  id: string;
  email: string;
  login_email: string | null;
  billing_email: string | null;
  full_name: string | null;
  phone: string | null;
  billing_type: string;
  schedule_type: string;
  tier: string | null;
  total_bookings: number;
  total_spend_zar: number;
  last_booking_at: string | null;
};

export default function AdminCustomerDetailPage() {
  const params = useParams();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const userId = typeof params.userId === "string" ? params.userId : "";
  const officeBase = pathname.startsWith("/office") ? "/office/customers" : "/admin/customers";
  const startInEdit = searchParams.get("edit") === "1";

  const [row, setRow] = useState<CustomerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(startInEdit);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [billingEmail, setBillingEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const bookingsBase = useMemo(
    () => (pathname.startsWith("/office") ? "/office/bookings/create" : "/admin/bookings/create"),
    [pathname],
  );

  async function loadCustomer() {
    if (!/^[0-9a-f-]{36}$/i.test(userId)) {
      setError("Invalid customer id.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const sb = getSupabaseBrowser();
      const token = (await sb?.auth.getSession())?.data.session?.access_token;
      if (!token) {
        setError("Not signed in.");
        return;
      }
      const res = await fetch(`/api/admin/customers/${encodeURIComponent(userId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await res.json().catch(() => ({}))) as { customer?: CustomerDetail; error?: string };
      if (!res.ok) {
        setError(json.error ?? "Could not load customer.");
        setRow(null);
        return;
      }
      const customer = json.customer ?? null;
      setRow(customer);
      if (customer) {
        setFullName(customer.full_name ?? "");
        setPhone(customer.phone ?? "");
        setBillingEmail(customer.billing_email ?? "");
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadCustomer();
  }, [userId]);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setActionError(null);
    setBusy(true);
    try {
      const sb = getSupabaseBrowser();
      const token = (await sb?.auth.getSession())?.data.session?.access_token;
      if (!token) {
        setActionError("Not signed in.");
        return;
      }
      const res = await fetch(`/api/admin/customers/${encodeURIComponent(userId)}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: fullName.trim(),
          phone: phone.trim(),
          billing_email: billingEmail.trim() || null,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { customer?: CustomerDetail; error?: string };
      if (!res.ok) {
        setActionError(json.error ?? "Update failed.");
        return;
      }
      setRow(json.customer ?? row);
      setEditing(false);
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!row) return;
    const label = row.full_name ?? row.email;
    const ok = window.confirm(
      `Delete customer "${label}"?\n\nThis permanently removes their login account. Only allowed when they have no bookings, invoices, or recurring plans.`,
    );
    if (!ok) return;

    setActionError(null);
    setBusy(true);
    try {
      const sb = getSupabaseBrowser();
      const token = (await sb?.auth.getSession())?.data.session?.access_token;
      if (!token) {
        setActionError("Not signed in.");
        return;
      }
      const res = await fetch(`/api/admin/customers/${encodeURIComponent(userId)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setActionError(json.error ?? "Delete failed.");
        return;
      }
      router.push(officeBase);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Link href={officeBase} className="text-sm font-medium text-blue-600 hover:underline dark:text-blue-400">
          ← Customers
        </Link>
        <Link href={`${bookingsBase}?user=${encodeURIComponent(userId)}`} className="text-sm font-medium text-blue-600 hover:underline dark:text-blue-400">
          New booking
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{editing ? "Edit customer" : "Customer"}</CardTitle>
          <CardDescription>Account id: {userId}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? <p className="text-sm text-zinc-500">Loading…</p> : null}
          {error ? (
            <p className="text-sm text-red-600 dark:text-red-400" role="alert">
              {error}
            </p>
          ) : null}
          {actionError ? (
            <p className="text-sm text-red-600 dark:text-red-400" role="alert">
              {actionError}
            </p>
          ) : null}

          {!loading && !error && row && editing ? (
            <form onSubmit={(e) => void onSave(e)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="full_name">Full name</Label>
                <Input id="full_name" value={fullName} onChange={(e) => setFullName(e.target.value)} required minLength={2} disabled={busy} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} required disabled={busy} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="billing_email">Billing email (optional)</Label>
                <Input
                  id="billing_email"
                  type="email"
                  value={billingEmail}
                  onChange={(e) => setBillingEmail(e.target.value)}
                  disabled={busy}
                  placeholder="Real email for invoices"
                />
              </div>
              <p className="text-xs text-zinc-500">Login email: {row.login_email ?? row.email}</p>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={busy}>
                  {busy ? "Saving…" : "Save changes"}
                </Button>
                <Button type="button" variant="outline" disabled={busy} onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          ) : null}

          {!loading && !error && row && !editing ? (
            <>
              <div className="text-sm">
                <p className="font-medium text-zinc-900 dark:text-zinc-50">{row.full_name ?? "—"}</p>
                <p className="text-zinc-600 dark:text-zinc-300">{row.email}</p>
                {row.phone ? <p className="text-zinc-600 dark:text-zinc-300">{row.phone}</p> : null}
                <p className="mt-2 text-xs text-zinc-500">
                  Billing: {row.billing_type} · Schedule: {row.schedule_type}
                </p>
                <p className="text-xs text-zinc-500">
                  {row.total_bookings} booking{row.total_bookings === 1 ? "" : "s"} · R{" "}
                  {row.total_spend_zar.toLocaleString("en-ZA")} spent
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button asChild>
                  <Link href={`${bookingsBase}?user=${encodeURIComponent(userId)}`}>Book for this customer</Link>
                </Button>
                <Button type="button" variant="outline" onClick={() => setEditing(true)} disabled={busy}>
                  Edit
                </Button>
                <Button type="button" variant="destructive" onClick={() => void onDelete()} disabled={busy}>
                  Delete
                </Button>
              </div>
            </>
          ) : null}

          {!loading && !error && !row ? <p className="text-sm text-zinc-500">Customer not found.</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}
