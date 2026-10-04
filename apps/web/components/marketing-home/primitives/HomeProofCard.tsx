import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type HomeProofCardProps = {
  label?: string;
  value: ReactNode;
  detail?: ReactNode;
  tone?: "default" | "brand";
  className?: string;
};

export function HomeProofCard({
  label,
  value,
  detail,
  tone = "default",
  className,
}: HomeProofCardProps) {
  const brand = tone === "brand";

  return (
    <article
      className={cn(
        "flex h-full flex-col justify-between rounded-[var(--ui-radius-xl)] border p-[var(--ui-space-5)] shadow-[var(--ui-shadow-sm)]",
        brand
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card text-card-foreground",
        className,
      )}
    >
      {label ? (
        <p
          className={cn(
            "text-[length:var(--ui-text-caption)] font-semibold uppercase tracking-[0.16em]",
            brand ? "text-primary-foreground/70" : "text-muted-foreground",
          )}
        >
          {label}
        </p>
      ) : null}
      <div
        className={cn(
          "mt-[var(--ui-space-4)] text-3xl font-semibold tracking-tight",
          brand ? "text-primary-foreground" : "text-foreground",
        )}
      >
        {value}
      </div>
      {detail ? (
        <div
          className={cn(
            "mt-[var(--ui-space-3)] text-[length:var(--ui-text-small)] leading-[var(--ui-leading-body)]",
            brand ? "text-primary-foreground/75" : "text-muted-foreground",
          )}
        >
          {detail}
        </div>
      ) : null}
    </article>
  );
}
