"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/browser";

type Row = {
  id: string;
  referrer_id: string;
  referrer_type: "customer" | "cleaner";
  referred_email_or_phone: string;
  referred_user_id: string | null;
  status: "pending" | "completed";
  reward_amount: number;
  created_at: string;
  completed_at: string | null;
};

export default function AdminReferralsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const run = async () => {
      const sb = getSupabaseBrowser();
      const session = await sb?.auth.getSession();
      const token = session?.data.session?.access_token;
      if (!token) {
        if (active) {
          setError("Please sign in as admin.");
          setLoading(false);
        }
        return;
      }
      const res = await fetch("/api/admin/referrals", { headers: { Authorization: `Bearer ${token}` } });
      const json = (await res.json()) as { referrals?: Row[]; error?: string };
      if (!active) return;
      if (!res.ok) {
        setError(json.error ?? "Failed to load referrals.");
        setLoading(false);
        return;
      }
      setRows(json.referrals ?? []);
      setLoading(false);
    };
    void run();
    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="mx-auto max-w-7xl space-y-6 px-6 py-6">
      <section>
        <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Referrals</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Track who referred who and rewards status.</p>
      </section>

      <section className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <table className="w-full min-w-[920px] text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/50">
            <tr>
              <th className="px-3 py-3">Referrer</th>
              <th className="px-3 py-3">Type</th>
              <th className="px-3 py-3">Referred</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3">Reward</th>
              <th className="px-3 py-3">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {loading ? (
              <tr><td colSpan={6} className="px-3 py-6 text-zinc-500">Loading referrals...</td></tr>
            ) : error ? (
              <tr><td colSpan={6} className="px-3 py-6 text-rose-700">{error}</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={6} className="px-3 py-6 text-zinc-500">No referrals yet.</td></tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-2 font-mono text-xs">{r.referrer_id.slice(0, 8)}…</td>
                  <td className="px-3 py-2">{r.referrer_type}</td>
                  <td className="px-3 py-2">{r.referred_email_or_phone}</td>
                  <td className="px-3 py-2">
                    <span className={["rounded-full px-2 py-0.5 text-xs font-semibold", r.status === "completed" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"].join(" ")}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-3 py-2">R {Number(r.reward_amount ?? 0).toLocaleString("en-ZA")}</td>
                  <td className="px-3 py-2">{new Date(r.created_at).toLocaleDateString("en-ZA")}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </main>
  );
}
