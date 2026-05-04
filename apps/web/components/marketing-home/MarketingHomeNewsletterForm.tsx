"use client";

import type { FormEvent } from "react";
import { useState } from "react";

type SubmitStatus = "idle" | "loading" | "success" | "error";

export function MarketingHomeNewsletterForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<SubmitStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const v = email.trim();
    if (!v) return;

    setStatus("loading");
    setErrorMessage(null);

    try {
      const res = await fetch("/api/newsletter/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: v }),
      });

      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };

      if (!res.ok) {
        setStatus("error");
        setErrorMessage(typeof data.error === "string" ? data.error : "Something went wrong. Please try again.");
        return;
      }

      setStatus("success");
      setEmail("");
    } catch {
      setStatus("error");
      setErrorMessage("Network error. Please check your connection and try again.");
    }
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
          disabled={status === "loading"}
          onChange={(e) => {
            setEmail(e.target.value);
            if (status === "success" || status === "error") {
              setStatus("idle");
              setErrorMessage(null);
            }
          }}
          className="min-h-11 w-full flex-1 rounded-full border border-white/15 bg-neutral-900 px-4 py-2.5 text-sm text-white placeholder:text-neutral-500 outline-none ring-0 transition focus:border-sky-400/60 focus:ring-2 focus:ring-sky-400/25 disabled:opacity-60"
          suppressHydrationWarning
        />
        <button
          type="submit"
          disabled={status === "loading"}
          className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-full bg-white px-6 text-sm font-semibold text-black transition hover:bg-neutral-100 disabled:pointer-events-none disabled:opacity-60"
          suppressHydrationWarning
        >
          {status === "loading" ? (
            <>
              <span className="sr-only">Submitting subscription</span>
              <span aria-hidden>…</span>
            </>
          ) : (
            "Subscribe"
          )}
        </button>
      </div>
      <p className="text-[11px] leading-snug text-neutral-500">No spam, only sparkling ideas!</p>
      {status === "success" ? (
        <p className="text-sm font-medium text-emerald-400" role="status">
          Thanks — you&apos;re subscribed!
        </p>
      ) : null}
      {status === "error" && errorMessage ? (
        <p className="text-sm font-medium text-red-300" role="alert">
          {errorMessage}
        </p>
      ) : null}
    </form>
  );
}
