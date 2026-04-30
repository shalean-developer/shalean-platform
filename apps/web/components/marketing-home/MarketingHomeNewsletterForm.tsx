"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import { CUSTOMER_SUPPORT_EMAIL } from "@/lib/site/customerSupport";

export function MarketingHomeNewsletterForm() {
  const [email, setEmail] = useState("");

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const v = email.trim();
    if (!v) return;
    window.location.href = `mailto:${CUSTOMER_SUPPORT_EMAIL}?subject=${encodeURIComponent("Newsletter — cleaning tips")}&body=${encodeURIComponent(`Please add this email to updates: ${v}`)}`;
  }

  return (
    <form className="mt-4 space-y-3" onSubmit={onSubmit}>
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-stretch">
        <label htmlFor="footer-newsletter-email" className="sr-only">
          Email address
        </label>
        <input
          id="footer-newsletter-email"
          type="email"
          name="email"
          autoComplete="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="min-h-11 w-full flex-1 rounded-full border border-white/15 bg-neutral-900 px-4 py-2.5 text-sm text-white placeholder:text-neutral-500 outline-none ring-0 transition focus:border-sky-400/60 focus:ring-2 focus:ring-sky-400/25"
          suppressHydrationWarning
        />
        <button
          type="submit"
          className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-full bg-white px-6 text-sm font-semibold text-black transition hover:bg-neutral-100"
          suppressHydrationWarning
        >
          Subscribe
        </button>
      </div>
      <p className="text-[11px] leading-snug text-neutral-500">No spam, only sparkling ideas!</p>
    </form>
  );
}
