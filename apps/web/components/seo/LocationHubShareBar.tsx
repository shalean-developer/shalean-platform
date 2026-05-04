"use client";

import { useCallback, useState } from "react";
import { Link2, Check } from "lucide-react";

type Props = {
  url: string;
  title: string;
};

/** Lightweight share / copy URL — backlink-readiness helper for guides and hubs. */
export function LocationHubShareBar({ url, title }: Props) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }, [url]);

  const share = useCallback(async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
      } catch {
        void copy();
      }
    } else {
      void copy();
    }
  }, [copy, title, url]);

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-zinc-200 bg-zinc-50/80 px-4 py-3 text-sm text-zinc-700">
      <span className="font-semibold text-zinc-900">Share this guide</span>
      <button
        type="button"
        onClick={() => void share()}
        className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 font-medium text-zinc-800 transition hover:bg-zinc-50"
      >
        <Link2 className="size-4" aria-hidden />
        Share link
      </button>
      <button
        type="button"
        onClick={() => void copy()}
        className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 font-medium text-zinc-800 transition hover:bg-zinc-50"
      >
        {copied ? <Check className="size-4 text-emerald-600" aria-hidden /> : null}
        {copied ? "Copied" : "Copy URL"}
      </button>
    </div>
  );
}
