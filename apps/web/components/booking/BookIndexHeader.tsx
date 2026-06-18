"use client";

import Link from "next/link";
import { Phone } from "lucide-react";
import { ShaleanNavLogo } from "@/components/brand/ShaleanNavLogo";
import { HeaderLoginButton } from "@/components/nav/HeaderLoginButton";

export function BookIndexHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-100 bg-white/95 backdrop-blur-sm">
      <div className="flex w-full items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        <Link href="/" aria-label="Shalean home">
          <ShaleanNavLogo className="h-8 w-auto max-w-[140px]" />
        </Link>

        <div className="flex shrink-0 items-center gap-2">
          <HeaderLoginButton />
          <a
            href="tel:0871535250"
            className="hidden items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-blue-600 sm:flex"
          >
            <Phone className="h-4 w-4" aria-hidden />
            087 153 5250
          </a>
          <a
            href="tel:0871535250"
            aria-label="Call us"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-50 text-blue-600 hover:bg-blue-100 sm:hidden"
          >
            <Phone className="h-4 w-4" aria-hidden />
          </a>
        </div>
      </div>
    </header>
  );
}
