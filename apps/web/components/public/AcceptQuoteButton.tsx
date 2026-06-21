"use client";

import Link from "next/link";
import { useState } from "react";

export function AcceptQuoteButton({ documentId, token }: { documentId: string; token: string }) {
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [invoiceViewUrl, setInvoiceViewUrl] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState(false);

  async function onAccept() {
    setStatus("loading");
    try {
      const res = await fetch(`/api/public/sales-documents/${documentId}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        viewUrl?: string;
        emailSent?: boolean;
        error?: string;
      };
      if (!res.ok) {
        setStatus("error");
        return;
      }
      setInvoiceViewUrl(typeof json.viewUrl === "string" ? json.viewUrl : null);
      setEmailSent(Boolean(json.emailSent));
      setStatus("done");
    } catch {
      setStatus("error");
    }
  }

  if (status === "done") {
    return (
      <div className="space-y-3 text-center">
        <p className="text-sm font-medium text-emerald-700">
          Quote accepted — your invoice is ready.
        </p>
        {emailSent ? (
          <p className="text-xs text-neutral-600">We also emailed you a link to view and pay online.</p>
        ) : (
          <p className="text-xs text-neutral-600">Use the button below to view your invoice and pay online.</p>
        )}
        {invoiceViewUrl ? (
          <Link
            href={invoiceViewUrl}
            className="inline-flex w-full items-center justify-center rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700"
          >
            View invoice & pay
          </Link>
        ) : null}
      </div>
    );
  }

  return (
    <button
      type="button"
      disabled={status === "loading"}
      onClick={() => onAccept()}
      className="w-full rounded-xl border border-blue-600 px-5 py-3 text-sm font-semibold text-blue-600 hover:bg-blue-50 disabled:opacity-60"
    >
      {status === "loading" ? "Accepting…" : status === "error" ? "Try again — accept quote" : "Accept quote"}
    </button>
  );
}
