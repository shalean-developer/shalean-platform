"use client";

import Link from "next/link";
import { Phone } from "lucide-react";
import { ShaleanNavLogo } from "@/components/brand/ShaleanNavLogo";
import { HeaderLoginButton } from "@/components/nav/HeaderLoginButton";

export function BookIndexHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-[var(--ui-container-wide)] items-center justify-between gap-4 px-[var(--ui-page-gutter)] py-3">
        <Link href="/" aria-label="Shalean home" className="shrink-0">
          <ShaleanNavLogo className="h-8 w-auto max-w-[140px]" priority />
        </Link>

        <div className="flex shrink-0 items-center gap-2">
          <HeaderLoginButton />
          <a
            href="tel:0871535250"
            className="hidden items-center gap-1.5 text-sm font-medium text-muted-foreground transition hover:text-primary sm:flex"
          >
            <Phone className="h-4 w-4" aria-hidden />
            087 153 5250
          </a>
          <a
            href="tel:0871535250"
            aria-label="Call us"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-primary shadow-[var(--ui-shadow-sm)] transition hover:bg-accent sm:hidden"
          >
            <Phone className="h-4 w-4" aria-hidden />
          </a>
        </div>
      </div>
    </header>
  );
}
