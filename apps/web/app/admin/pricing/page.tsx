"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import { emitAdminToast } from "@/lib/admin/toastBus";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type PricingService = {
  id: string;
  slug: string;
  name: string;
  base_price: number;
  price_per_bedroom: number;
  price_per_bathroom: number;
  min_hours: number;
  max_hours: number;
  is_active: boolean;
  sort_order: number;
};

type PricingExtra = {
  id: string;
  slug: string;
  name: string;
  price: number;
  service_type: string;
  is_popular: boolean;
  is_active: boolean;
  sort_order: number;
};

export default function AdminPricingPage() {
  const [loading, setLoading] = useState(true);
  const [services, setServices] = useState<PricingService[]>([]);
  const [extras, setExtras] = useState<PricingExtra[]>([]);
  const [banner, setBanner] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const sb = getSupabaseBrowser();
    const token = (await sb?.auth.getSession())?.data.session?.access_token;
    if (!token) {
      emitAdminToast("Sign in as admin.", "error");
      setLoading(false);
      return;
    }
    const [sRes, eRes] = await Promise.all([
      fetch("/api/admin/pricing-services", { headers: { Authorization: `Bearer ${token}` } }),
      fetch("/api/admin/pricing-extras", { headers: { Authorization: `Bearer ${token}` } }),
    ]);
    const sJson = (await sRes.json()) as { services?: PricingService[]; message?: string; error?: string };
    const eJson = (await eRes.json()) as { extras?: PricingExtra[]; message?: string; error?: string };
    if (!sRes.ok) {
      emitAdminToast(sJson.error ?? "Could not load services.", "error");
    } else {
      setServices(sJson.services ?? []);
      setBanner(sJson.message ?? eJson.message ?? null);
    }
    if (!eRes.ok) {
      emitAdminToast(eJson.error ?? "Could not load extras.", "error");
    } else {
      setExtras(eJson.extras ?? []);
      if (!sJson.message && eJson.message) setBanner(eJson.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function patchService(row: PricingService, patch: Partial<PricingService>) {
    const sb = getSupabaseBrowser();
    const token = (await sb?.auth.getSession())?.data.session?.access_token;
    if (!token) return;
    const res = await fetch("/api/admin/pricing-services", {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ id: row.id, ...patch }),
    });
    if (!res.ok) {
      const j = (await res.json()) as { error?: string };
      emitAdminToast(j.error ?? "Save failed", "error");
      void load();
      return;
    }
    emitAdminToast("Saved", "success");
    setServices((prev) => prev.map((s) => (s.id === row.id ? { ...s, ...patch } : s)));
  }

  async function patchExtra(row: PricingExtra, patch: Partial<PricingExtra>) {
    const sb = getSupabaseBrowser();
    const token = (await sb?.auth.getSession())?.data.session?.access_token;
    if (!token) return;
    const res = await fetch("/api/admin/pricing-extras", {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ id: row.id, ...patch }),
    });
    if (!res.ok) {
      const j = (await res.json()) as { error?: string };
      emitAdminToast(j.error ?? "Save failed", "error");
      void load();
      return;
    }
    emitAdminToast("Saved", "success");
    setExtras((prev) => prev.map((e) => (e.id === row.id ? { ...e, ...patch } : e)));
  }

  return (
    <main className="mx-auto max-w-7xl space-y-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Pricing</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Edit service and add-on catalog in Supabase. Checkout still uses in-app pricing until wired to these tables.
        </p>
        {banner ? (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-50">
            {banner}
          </p>
        ) : null}
      </div>

      {loading ? (
        <div className="space-y-4">
          <div className="h-40 animate-pulse rounded-xl bg-zinc-200 dark:bg-zinc-800" />
          <div className="h-64 animate-pulse rounded-xl bg-zinc-200 dark:bg-zinc-800" />
        </div>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Services</CardTitle>
              <CardDescription>Base price and per-room modifiers (ZAR). Toggle active to hide from future tooling.</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full min-w-[920px] text-left text-sm">
                <thead className="border-b text-xs uppercase text-zinc-500">
                  <tr>
                    <th className="pb-2 pr-2">Name</th>
                    <th className="pb-2 pr-2">Base</th>
                    <th className="pb-2 pr-2">/ bedroom</th>
                    <th className="pb-2 pr-2">/ bathroom</th>
                    <th className="pb-2 pr-2">Min h</th>
                    <th className="pb-2 pr-2">Max h</th>
                    <th className="pb-2 pr-2">Active</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {services.map((row) => (
                    <tr
                      key={`${row.id}-${row.base_price}-${row.price_per_bedroom}-${row.price_per_bathroom}-${row.min_hours}-${row.max_hours}-${row.is_active}-${row.name}`}
                    >
                      <td className="py-2 pr-2">
                        <div className="text-xs text-zinc-500">{row.slug}</div>
                        <input
                          className="mt-1 w-full max-w-xs rounded border border-zinc-200 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                          defaultValue={row.name}
                          onBlur={(e) => {
                            const v = e.target.value.trim();
                            if (v && v !== row.name) void patchService(row, { name: v });
                          }}
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <input
                          type="number"
                          className="w-24 rounded border border-zinc-200 px-2 py-1 tabular-nums dark:border-zinc-700 dark:bg-zinc-950"
                          defaultValue={row.base_price}
                          onBlur={(e) => {
                            const n = Number(e.target.value);
                            if (Number.isFinite(n) && n !== row.base_price) void patchService(row, { base_price: n });
                          }}
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <input
                          type="number"
                          className="w-24 rounded border border-zinc-200 px-2 py-1 tabular-nums dark:border-zinc-700 dark:bg-zinc-950"
                          defaultValue={row.price_per_bedroom}
                          onBlur={(e) => {
                            const n = Number(e.target.value);
                            if (Number.isFinite(n) && n !== row.price_per_bedroom) {
                              void patchService(row, { price_per_bedroom: n });
                            }
                          }}
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <input
                          type="number"
                          className="w-24 rounded border border-zinc-200 px-2 py-1 tabular-nums dark:border-zinc-700 dark:bg-zinc-950"
                          defaultValue={row.price_per_bathroom}
                          onBlur={(e) => {
                            const n = Number(e.target.value);
                            if (Number.isFinite(n) && n !== row.price_per_bathroom) {
                              void patchService(row, { price_per_bathroom: n });
                            }
                          }}
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <input
                          type="number"
                          step={0.25}
                          className="w-20 rounded border border-zinc-200 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-950"
                          defaultValue={row.min_hours}
                          onBlur={(e) => {
                            const n = Number(e.target.value);
                            if (Number.isFinite(n) && n !== row.min_hours) void patchService(row, { min_hours: n });
                          }}
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <input
                          type="number"
                          step={0.25}
                          className="w-20 rounded border border-zinc-200 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-950"
                          defaultValue={row.max_hours}
                          onBlur={(e) => {
                            const n = Number(e.target.value);
                            if (Number.isFinite(n) && n !== row.max_hours) void patchService(row, { max_hours: n });
                          }}
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <button
                          type="button"
                          role="switch"
                          aria-checked={row.is_active}
                          onClick={() => void patchService(row, { is_active: !row.is_active })}
                          className={[
                            "relative inline-flex h-7 w-12 shrink-0 rounded-full border transition",
                            row.is_active
                              ? "border-emerald-500 bg-emerald-500"
                              : "border-zinc-300 bg-zinc-200 dark:border-zinc-600 dark:bg-zinc-700",
                          ].join(" ")}
                        >
                          <span
                            className={[
                              "pointer-events-none absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition",
                              row.is_active ? "left-6" : "left-0.5",
                            ].join(" ")}
                          />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {services.length === 0 ? <p className="text-sm text-zinc-500">No service rows yet.</p> : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Extras</CardTitle>
              <CardDescription>Per add-on price. Service type: light, heavy, or all.</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="border-b text-xs uppercase text-zinc-500">
                  <tr>
                    <th className="pb-2 pr-2">Name</th>
                    <th className="pb-2 pr-2">Price</th>
                    <th className="pb-2 pr-2">Service type</th>
                    <th className="pb-2 pr-2">Popular</th>
                    <th className="pb-2 pr-2">Active</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {extras.map((row) => (
                    <tr key={`${row.id}-${row.price}-${row.service_type}-${row.is_popular}-${row.is_active}`}>
                      <td className="py-2 pr-2">
                        <div className="font-medium">{row.name}</div>
                        <div className="text-xs text-zinc-500">{row.slug}</div>
                      </td>
                      <td className="py-2 pr-2">
                        <input
                          type="number"
                          className="w-24 rounded border border-zinc-200 px-2 py-1 tabular-nums dark:border-zinc-700 dark:bg-zinc-950"
                          defaultValue={row.price}
                          onBlur={(e) => {
                            const n = Number(e.target.value);
                            if (Number.isFinite(n) && n !== row.price) void patchExtra(row, { price: n });
                          }}
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <select
                          className="rounded border border-zinc-200 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-950"
                          defaultValue={row.service_type}
                          onChange={(e) => void patchExtra(row, { service_type: e.target.value })}
                        >
                          <option value="light">light</option>
                          <option value="heavy">heavy</option>
                          <option value="all">all</option>
                        </select>
                      </td>
                      <td className="py-2 pr-2">
                        <button
                          type="button"
                          role="switch"
                          aria-checked={row.is_popular}
                          onClick={() => void patchExtra(row, { is_popular: !row.is_popular })}
                          className={[
                            "relative inline-flex h-7 w-12 shrink-0 rounded-full border transition",
                            row.is_popular ? "border-amber-500 bg-amber-500" : "border-zinc-300 bg-zinc-200 dark:border-zinc-600 dark:bg-zinc-700",
                          ].join(" ")}
                        >
                          <span
                            className={[
                              "pointer-events-none absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition",
                              row.is_popular ? "left-6" : "left-0.5",
                            ].join(" ")}
                          />
                        </button>
                      </td>
                      <td className="py-2 pr-2">
                        <button
                          type="button"
                          role="switch"
                          aria-checked={row.is_active}
                          onClick={() => void patchExtra(row, { is_active: !row.is_active })}
                          className={[
                            "relative inline-flex h-7 w-12 shrink-0 rounded-full border transition",
                            row.is_active ? "border-emerald-500 bg-emerald-500" : "border-zinc-300 bg-zinc-200 dark:border-zinc-600 dark:bg-zinc-700",
                          ].join(" ")}
                        >
                          <span
                            className={[
                              "pointer-events-none absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition",
                              row.is_active ? "left-6" : "left-0.5",
                            ].join(" ")}
                          />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {extras.length === 0 ? <p className="text-sm text-zinc-500">No extra rows yet.</p> : null}
            </CardContent>
          </Card>
        </>
      )}
    </main>
  );
}
