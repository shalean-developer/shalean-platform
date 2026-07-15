"use client";

import { useEffect } from "react";
import Link from "next/link";
import { MapPin, X } from "lucide-react";
import {
  CUSTOMER_SUPPORT_TELEPHONE_DISPLAY,
  CUSTOMER_SUPPORT_TELEPHONE_TEL,
  customerSupportWhatsAppHref,
} from "@/lib/site/customerSupport";

type UnsupportedSuburbModalProps = {
  open: boolean;
  message: string;
  onClose: () => void;
};

/**
 * Floating recovery UI for unsupported suburbs — does not shift the booking form layout.
 */
export function UnsupportedSuburbModal({ open, message, onClose }: UnsupportedSuburbModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="unsupported-suburb-title"
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 flex w-full max-w-md flex-col rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-4 sm:px-5">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600">
              <MapPin className="h-5 w-5" aria-hidden />
            </div>
            <div className="min-w-0">
              <h3 id="unsupported-suburb-title" className="text-base font-bold text-slate-900">
                Area not yet covered
              </h3>
              <p className="mt-1 text-sm text-slate-600">{message}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 px-4 py-5 sm:px-5">
          <p className="text-sm text-slate-600">
            Choose a nearby supported suburb to keep your booking progress, or contact us and we&apos;ll check coverage.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Link
              href="/areas-we-serve"
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700"
            >
              View areas we serve
            </Link>
            <a
              href={customerSupportWhatsAppHref()}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-green-200 bg-white px-4 text-sm font-semibold text-green-800 hover:bg-green-50"
            >
              WhatsApp support
            </a>
            <a
              href={CUSTOMER_SUPPORT_TELEPHONE_TEL}
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50"
            >
              Call {CUSTOMER_SUPPORT_TELEPHONE_DISPLAY}
            </a>
          </div>
        </div>

        <div className="border-t border-slate-100 px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-5">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Continue editing suburb
          </button>
        </div>
      </div>
    </div>
  );
}
