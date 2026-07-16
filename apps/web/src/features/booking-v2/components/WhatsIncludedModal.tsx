"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

const INCLUDED_ITEMS = [
  "Kitchens, bathrooms, bedrooms, and living areas dusted and wiped",
  "Floors vacuumed and mopped; surfaces and mirrors cleaned",
  "Bins emptied; general tidy of high-touch areas",
  "Add-on extras (oven, fridge, windows, etc.) are optional and priced separately",
] as const;

/**
 * Floating "What's included" — centered modal on desktop, bottom sheet on mobile.
 * Does not push booking page content.
 */
export function WhatsIncludedModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm font-semibold text-blue-600 underline-offset-2 hover:underline"
      >
        What&apos;s included in standard cleaning
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="whats-included-title"
        >
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="relative z-10 flex w-full max-w-md flex-col rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-4 sm:px-5">
              <h3 id="whats-included-title" className="text-base font-bold text-slate-900">
                What&apos;s included
              </h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <ul className="space-y-2 px-4 py-5 text-sm text-slate-600 sm:px-5">
              {INCLUDED_ITEMS.map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-600" aria-hidden />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <div className="border-t border-slate-100 px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-5">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-blue-600 text-sm font-semibold text-white hover:bg-blue-700"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
