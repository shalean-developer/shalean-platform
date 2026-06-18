"use client";

import { useState } from "react";
import { Tag, Edit2, Save, X, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

type PricingSection = "base" | "extras" | "team" | "cleaner_count" | "discounts";

const TABS: { id: PricingSection; label: string }[] = [
  { id: "base", label: "Base Pricing" },
  { id: "extras", label: "Extras" },
  { id: "team", label: "Team Pricing" },
  { id: "cleaner_count", label: "Cleaner Count" },
  { id: "discounts", label: "Recurring Discounts" },
];

const BASE_PRICING = [
  { service: "Standard Clean", duration: "2–3 hrs", price: "R 780", description: "Regular home cleaning" },
  { service: "Deep Clean", duration: "4–6 hrs", price: "R 1 250", description: "Thorough top-to-bottom clean" },
  { service: "Move Out Clean", duration: "5–8 hrs", price: "R 2 100", description: "Full property clean for tenants" },
  { service: "End of Tenancy", duration: "6–10 hrs", price: "R 3 400", description: "Comprehensive exit cleaning" },
  { service: "Office Clean", duration: "2–4 hrs", price: "R 950", description: "Commercial office spaces" },
];

const EXTRAS = [
  { name: "Inside oven", price: "R 200" },
  { name: "Inside fridge", price: "R 150" },
  { name: "Inside windows", price: "R 180" },
  { name: "Laundry", price: "R 120" },
  { name: "Ironing (per item)", price: "R 25" },
  { name: "Carpet steam clean", price: "R 350" },
];

const DISCOUNTS = [
  { frequency: "Weekly", discount: "20%", label: "Most popular" },
  { frequency: "Fortnightly", discount: "15%", label: "" },
  { frequency: "Monthly", discount: "10%", label: "" },
];

export default function PricingPage() {
  const [tab, setTab] = useState<PricingSection>("base");
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Pricing</h1>
          <p className="mt-0.5 text-sm text-slate-500">Manage service base pricing, extras, team rates and recurring discounts.</p>
        </div>
        <button type="button" className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 shadow-sm">
          <Save className="h-4 w-4" /> Save all changes
        </button>
      </div>

      <div className="rounded-2xl bg-white border border-slate-100 shadow-sm">
        {/* Tabs */}
        <div className="flex gap-1 border-b border-slate-100 px-4 pt-3 pb-0 overflow-x-auto">
          {TABS.map((t) => (
            <button key={t.id} type="button" onClick={() => setTab(t.id)}
              className={cn("pb-2.5 px-3 text-sm font-semibold whitespace-nowrap border-b-2 transition-colors",
                tab === t.id ? "border-blue-600 text-blue-600" : "border-transparent text-slate-500 hover:text-slate-800")}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="p-5">
          {tab === "base" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm text-slate-600">Base prices applied before extras or team adjustments.</p>
                <button type="button" className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                  <Plus className="h-3.5 w-3.5" /> Add service
                </button>
              </div>
              {BASE_PRICING.map((item) => (
                <div key={item.service} className="flex items-center justify-between rounded-xl border border-slate-100 px-4 py-3 hover:bg-slate-50/50 transition-colors">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{item.service}</p>
                    <p className="text-xs text-slate-400">{item.description} · {item.duration}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    {editing === item.service ? (
                      <div className="flex items-center gap-2">
                        <input defaultValue={item.price} className="w-24 rounded-lg border border-blue-300 px-2 py-1 text-sm focus:outline-none" />
                        <button type="button" onClick={() => setEditing(null)} className="text-emerald-600 hover:text-emerald-700"><Save className="h-4 w-4" /></button>
                        <button type="button" onClick={() => setEditing(null)} className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
                      </div>
                    ) : (
                      <>
                        <span className="text-base font-bold text-slate-800">{item.price}</span>
                        <button type="button" onClick={() => setEditing(item.service)}
                          className="rounded-lg p-1.5 text-slate-300 hover:bg-blue-50 hover:text-blue-600 transition-colors">
                          <Edit2 className="h-4 w-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === "extras" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm text-slate-600">Optional add-ons available during booking checkout.</p>
                <button type="button" className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                  <Plus className="h-3.5 w-3.5" /> Add extra
                </button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {EXTRAS.map((e) => (
                  <div key={e.name} className="flex items-center justify-between rounded-xl border border-slate-100 px-4 py-3">
                    <span className="text-sm font-medium text-slate-700">{e.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-slate-800">{e.price}</span>
                      <button type="button" className="rounded-lg p-1.5 text-slate-300 hover:bg-blue-50 hover:text-blue-600 transition-colors">
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === "team" && (
            <div className="space-y-3">
              <p className="text-sm text-slate-600 mb-4">Pricing adjustments for multi-cleaner teams.</p>
              {[
                { team: "1 cleaner", multiplier: "1.0×", label: "Standard rate" },
                { team: "2 cleaners", multiplier: "1.7×", label: "10% bulk discount" },
                { team: "3 cleaners", multiplier: "2.3×", label: "23% bulk discount" },
              ].map((t) => (
                <div key={t.team} className="flex items-center justify-between rounded-xl border border-slate-100 px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{t.team}</p>
                    <p className="text-xs text-slate-400">{t.label}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-blue-50 px-3 py-1 text-sm font-bold text-blue-700">{t.multiplier}</span>
                    <button type="button" className="rounded-lg p-1.5 text-slate-300 hover:bg-blue-50 hover:text-blue-600 transition-colors">
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === "cleaner_count" && (
            <div className="space-y-3">
              <p className="text-sm text-slate-600 mb-4">Per-cleaner pricing tiers based on headcount selection.</p>
              {[1, 2, 3, 4].map((n) => (
                <div key={n} className="flex items-center justify-between rounded-xl border border-slate-100 px-4 py-3">
                  <p className="text-sm font-semibold text-slate-800">{n} cleaner{n > 1 ? "s" : ""}</p>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-800">R {(780 * (n === 1 ? 1 : n === 2 ? 1.7 : n === 3 ? 2.3 : 2.9)).toFixed(0)} base</span>
                    <button type="button" className="rounded-lg p-1.5 text-slate-300 hover:bg-blue-50 hover:text-blue-600 transition-colors">
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === "discounts" && (
            <div className="space-y-3">
              <p className="text-sm text-slate-600 mb-4">Automatic discounts applied to recurring booking plans.</p>
              {DISCOUNTS.map((d) => (
                <div key={d.frequency} className="flex items-center justify-between rounded-xl border border-slate-100 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <p className="text-sm font-semibold text-slate-800">{d.frequency}</p>
                    {d.label && (
                      <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-bold text-orange-700">{d.label}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-bold text-emerald-700">{d.discount} off</span>
                    <button type="button" className="rounded-lg p-1.5 text-slate-300 hover:bg-blue-50 hover:text-blue-600 transition-colors">
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
