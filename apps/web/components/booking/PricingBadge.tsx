"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

type PricingBadgeProps = {
  /** Pre–time estimate (e.g. Step 2 / canonical checkout quote). */
  anchorPrice: number;
  /** Locked total after slot selection. */
  finalPrice: number;
  className?: string;
};

/**
 * Real savings vs surge vs neutral — only meaningful when both totals are known
 * (e.g. schedule step after lock). Not for marketing/placeholder savings.
 */
export function PricingBadge({ anchorPrice, finalPrice, className }: PricingBadgeProps) {
  if (!Number.isFinite(anchorPrice) || !Number.isFinite(finalPrice) || anchorPrice <= 0) {
    return null;
  }

  const diffZar = Math.round(anchorPrice - finalPrice);
  const percent = Math.round((diffZar / anchorPrice) * 100);

  if (finalPrice < anchorPrice) {
    return (
      <motion.div
        className={cn("space-y-0.5", className)}
        role="status"
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
      >
        <p className="text-sm font-medium text-green-600 dark:text-green-400">
          ✔ You saved R{Math.abs(diffZar).toLocaleString("en-ZA")} ({Math.abs(percent)}%) with this time
        </p>
        <p className="text-xs text-green-600 dark:text-green-500">Best available price</p>
      </motion.div>
    );
  }

  if (finalPrice > anchorPrice) {
    return (
      <motion.div
        className={cn("space-y-0.5", className)}
        role="status"
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
      >
        <p className="text-sm font-medium text-orange-600 dark:text-orange-400">⚡ Peak time pricing</p>
        <p className="text-sm text-orange-600 dark:text-orange-400">+{Math.abs(percent)}% due to high demand</p>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">Higher price for this time. Try another time to save.</p>
      </motion.div>
    );
  }

  return <p className={cn("text-xs text-zinc-500 dark:text-zinc-400", className)} role="status">Standard pricing applied</p>;
}

type LockedPriceStackProps = {
  anchorPrice: number | null;
  finalPrice: number;
  className?: string;
};

/** Strikethrough estimate + prominent final; messaging via {@link PricingBadge}. */
export function LockedPriceStack({ anchorPrice, finalPrice, className }: LockedPriceStackProps) {
  const showAnchor = anchorPrice != null && Number.isFinite(anchorPrice) && anchorPrice > 0;

  return (
    <div className={cn("space-y-1", className)}>
      {showAnchor ? (
        <p className="text-sm tabular-nums text-zinc-500 line-through dark:text-zinc-400">
          R {anchorPrice.toLocaleString("en-ZA")}
        </p>
      ) : null}
      <motion.p
        key={finalPrice}
        className="text-3xl font-bold tabular-nums text-zinc-900 dark:text-zinc-50"
        initial={{ opacity: 0.92, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      >
        R {finalPrice.toLocaleString("en-ZA")}
      </motion.p>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">Price depends on time and availability</p>
      {showAnchor ? <PricingBadge anchorPrice={anchorPrice} finalPrice={finalPrice} /> : null}
    </div>
  );
}
