"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type CustomerHit = {
  id: string;
  email: string | null;
  full_name: string | null;
  billing_type: string;
  schedule_type: string;
};

export default function AdminCustomerDetailPage() {
  const params = useParams();
  const userId = typeof params.userId === "string" ? params.userId : "";
  const [row, setRow] = useState<CustomerHit | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!/^[0-9a-f-]{36}$/i.test(userId)) {
      setError("Invalid customer id.");
      setLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const sb = getSupabaseBrowser();
        const token = (await sb?.auth.getSession())?.data.session?.access_token;
        if (!token) {
          setError("Not signed in.");
          return;
        }
        const res = await fetch(`/api/admin/bookings/customers?id=${encodeURIComponent(userId)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = (await res.json().catch(() => ({}))) as { customers?: CustomerHit[]; error?: string };
        if (!res.ok) {
          setError(json.error ?? "Could not load customer.");
          return;
        }
        const hit = (json.customers ?? [])[0] ?? null;
        if (!cancelled) setRow(hit);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Link href="/admin/customers" className="text-sm font-medium text-blue-600 hover:underline dark:text-blue-400">
          ← Customers
        </Link>
        <Link
          href={`/admin/bookings/create`}
          className="text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
        >
          New booking
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Customer</CardTitle>
          <CardDescription>Account id: {userId}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? <p className="text-sm text-zinc-500">Loading…</p> : null}
          {error ? (
            <p className="text-sm text-red-600 dark:text-red-400" role="alert">
              {error}
            </p>
          ) : null}
          {!loading && !error && row ? (
            <>
              <div className="text-sm">
                <p className="font-medium text-zinc-900 dark:text-zinc-50">{row.full_name ?? "—"}</p>
                <p className="text-zinc-600 dark:text-zinc-300">{row.email ?? "—"}</p>
                <p className="mt-2 text-xs text-zinc-500">
                  Billing: {row.billing_type} · Schedule: {row.schedule_type}
                </p>
              </div>
              <Button asChild>
                <Link href={`/admin/bookings/create?user=${encodeURIComponent(userId)}`}>Book for this customer</Link>
              </Button>
              <p className="text-xs text-zinc-500">
                Opens create booking with this customer pre-selected when possible.
              </p>
            </>
          ) : null}
          {!loading && !error && !row ? <p className="text-sm text-zinc-500">Customer not found.</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}
