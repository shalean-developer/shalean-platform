import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type MarketingSectionHeaderProps = {
  eyebrow: string;
  title: string;
  description?: ReactNode;
  align?: "left" | "center";
  eyebrowTone?: "default" | "brand";
  className?: string;
};

export function MarketingSectionHeader({
  eyebrow,
  title,
  description,
  align = "center",
  eyebrowTone = "default",
  className,
}: MarketingSectionHeaderProps) {
  const centered = align === "center";

  return (
    <header
      className={cn(
        "max-w-5xl",
        centered && "mx-auto text-center",
        className,
      )}
    >
      <p
        className={cn(
          "text-[length:var(--ui-text-small)] font-semibold uppercase tracking-[0.14em]",
          eyebrowTone === "brand" ? "text-primary" : "text-foreground/60",
        )}
      >
        {eyebrow}
      </p>
      <h2 className="mt-[var(--ui-space-4)] text-[length:var(--ui-text-page-title)] font-semibold leading-[1.08] tracking-[-0.03em] text-foreground md:text-[length:var(--ui-text-hero-title)]">
        {title}
      </h2>
      {description ? (
        <div
          className={cn(
            "mt-[var(--ui-space-5)] max-w-3xl text-[length:var(--ui-text-lead)] leading-[var(--ui-leading-body)] text-muted-foreground",
            centered && "mx-auto",
          )}
        >
          {description}
        </div>
      ) : null}
    </header>
  );
}
