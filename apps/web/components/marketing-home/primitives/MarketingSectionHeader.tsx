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
          "text-[length:var(--ui-text-body)] font-medium uppercase tracking-[0.08em]",
          eyebrowTone === "brand" ? "text-primary" : "text-foreground/75",
        )}
      >
        {eyebrow}
      </p>
      <h2 className="mt-[var(--ui-space-6)] text-[length:var(--ui-text-page-title)] font-semibold leading-[var(--ui-leading-tight)] tracking-tight text-foreground">
        {title}
      </h2>
      {description ? (
        <div
          className={cn(
            "mt-[var(--ui-space-4)] max-w-4xl text-[length:var(--ui-text-lead)] leading-[var(--ui-leading-body)] text-muted-foreground",
            centered && "mx-auto",
          )}
        >
          {description}
        </div>
      ) : null}
    </header>
  );
}
