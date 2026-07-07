"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

type ProfileSettingsBackLinkProps = {
  href?: string;
  label?: string;
  className?: string;
};

export function ProfileSettingsBackLink({
  href = "/jobs/profile",
  label = "Profile",
  className,
}: ProfileSettingsBackLinkProps) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-1 text-sm font-medium text-slate-500 transition-colors hover:text-slate-800",
        className,
      )}
    >
      <ChevronLeft className="size-4" aria-hidden />
      {label}
    </Link>
  );
}
