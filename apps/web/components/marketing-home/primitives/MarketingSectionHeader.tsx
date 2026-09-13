import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type MarketingSectionHeaderProps = {
  eyebrow: string;
  title: string;
  description?: ReactNode;
  align?: "left" | "center";
  eyebrowTone?: "default" | "brand";
  headingId?: string;
  className?: string;
};

export function MarketingSectionHeader({
  eyebrow,
  title,
  description,
  align = "center",
  headingId,
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
          "text-xs font-semibold uppercase tracking-[0.16em] text-[#0051FF]",
        )}
      >
        {eyebrow}
      </p>
      <h2
        id={headingId}
        className="mt-4 text-[clamp(2rem,3.6vw,3.5rem)] font-medium leading-[1.06] tracking-[-0.035em] text-[#00164E]"
      >
        {title}
      </h2>
      {description ? (
        <div
          className={cn(
            "mt-5 max-w-3xl text-base leading-7 text-slate-600 md:text-lg",
            centered && "mx-auto",
          )}
        >
          {description}
        </div>
      ) : null}
    </header>
  );
}
