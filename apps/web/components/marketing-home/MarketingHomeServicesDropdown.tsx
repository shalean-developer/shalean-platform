"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  MARKETING_HEADER_SERVICE_LINKS,
  marketingHeaderNavLinkClass,
} from "@/lib/marketing/marketingHomeHeaderNav";

export function MarketingHomeServicesDropdown() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        className={cn(marketingHeaderNavLinkClass, open && "bg-blue-50 text-blue-700")}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        Services
        <ChevronDown
          className={cn("h-4 w-4 transition-transform duration-150", open && "rotate-180")}
        />
      </button>
      <div
        className={cn(
          "absolute left-0 top-full z-50 mt-1.5 w-52 rounded-xl border border-blue-100 bg-white py-1.5 shadow-lg transition-[opacity,visibility] duration-150",
          open ? "visible opacity-100" : "invisible pointer-events-none opacity-0",
        )}
        aria-hidden={!open}
      >
        {MARKETING_HEADER_SERVICE_LINKS.map(([item, itemHref]) => (
          <Link
            key={item}
            href={itemHref}
            className="block px-4 py-2 text-sm text-slate-700 hover:bg-blue-50 hover:text-blue-700"
            onClick={() => setOpen(false)}
            tabIndex={open ? 0 : -1}
          >
            {item}
          </Link>
        ))}
      </div>
    </div>
  );
}
