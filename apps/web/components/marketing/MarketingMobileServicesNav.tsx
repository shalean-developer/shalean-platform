"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { MARKETING_HEADER_SERVICE_LINKS } from "@/lib/marketing/marketingHomeHeaderNav";
import {
  marketingMobileDrawerLinkClass,
  marketingMobileDrawerSubLinkClass,
} from "@/lib/marketing/marketingMobileLayout";
import { cn } from "@/lib/utils";

type Props = {
  drawerOpen: boolean;
  onNavigate: () => void;
};

export function MarketingMobileServicesNav({ drawerOpen, onNavigate }: Props) {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!drawerOpen) setExpanded(false);
  }, [drawerOpen]);

  return (
    <div>
      <button
        type="button"
        className={cn(
          marketingMobileDrawerLinkClass,
          "flex w-full items-center justify-between gap-2",
          expanded && "bg-blue-50 text-blue-700",
        )}
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        tabIndex={drawerOpen ? 0 : -1}
      >
        Services
        <ChevronDown
          className={cn("h-4 w-4 shrink-0 transition-transform duration-150", expanded && "rotate-180")}
          aria-hidden
        />
      </button>
      {expanded ? (
        <div className="ml-3 flex flex-col gap-0.5 border-l border-blue-100 py-1 pl-3">
          {MARKETING_HEADER_SERVICE_LINKS.map(([item, itemHref]) => (
            <Link
              key={item}
              href={itemHref}
              className={marketingMobileDrawerSubLinkClass}
              onClick={onNavigate}
              tabIndex={drawerOpen ? 0 : -1}
            >
              {item}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
