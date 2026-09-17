"use client";

import Link from "next/link";
import { ShaleanNavLogo } from "@/components/brand/ShaleanNavLogo";
import { HeaderLoginButton } from "@/components/nav/HeaderLoginButton";

export function BookIndexHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-[var(--ui-container-wide)] items-center justify-between gap-4 px-[var(--ui-page-gutter)] py-3">
        <Link href="/" aria-label="Shalean home" className="shrink-0">
          <ShaleanNavLogo className="h-8 w-auto max-w-[140px]" priority />
        </Link>

        <HeaderLoginButton avatarOnly />
      </div>
    </header>
  );
}
