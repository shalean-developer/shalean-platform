"use client";

import { Mail, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const SITE = "https://www.shalean.co.za";

function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="currentColor">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

type Props = {
  urlPath: string;
  title: string;
  className?: string;
};

export function BlogShareBar({ urlPath, title, className }: Props) {
  const url = `${SITE}${urlPath.startsWith("/") ? urlPath : `/${urlPath}`}`;
  const enc = encodeURIComponent(url);
  const encTitle = encodeURIComponent(title);

  const items = [
    {
      label: "Share on WhatsApp",
      href: `https://wa.me/?text=${encTitle}%20${enc}`,
      icon: MessageCircle,
    },
    {
      label: "Share on Facebook",
      href: `https://www.facebook.com/sharer/sharer.php?u=${enc}`,
      icon: FacebookIcon,
    },
    {
      label: "Share on X",
      href: `https://twitter.com/intent/tweet?url=${enc}&text=${encTitle}`,
      icon: XIcon,
    },
    {
      label: "Share by email",
      href: `mailto:?subject=${encTitle}&body=${enc}`,
      icon: Mail,
    },
  ] as const;

  return (
    <section className={cn("not-prose border-y border-zinc-200/90 py-6", className)} aria-label="Share this article">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Share</p>
      <ul className="mt-3 flex flex-wrap gap-2">
        {items.map(({ label, href, icon: Icon }) => (
          <li key={label}>
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex size-11 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-700 shadow-sm transition hover:border-blue-300 hover:bg-blue-50/80 hover:text-blue-800"
              aria-label={label}
            >
              <Icon className="size-5" />
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
