import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type HomeSectionHeaderProps = {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  align?: "left" | "center";
  className?: string;
};

export function HomeSectionHeader({
  eyebrow,
  title,
  description,
  align = "left",
  className,
}: HomeSectionHeaderProps) {
  const centered = align === "center";

  return (
    <header
      className={cn(
        "max-w-3xl",
        centered && "mx-auto text-center",
        className,
      )}
    >
      {eyebrow ? (
        <p className="text-[length:var(--ui-text-caption)] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {eyebrow}
        </p>
      ) : null}
      <h2 className="mt-[var(--ui-space-2)] text-[length:var(--ui-text-section-title)] font-semibold leading-[var(--ui-leading-tight)] tracking-tight text-foreground">
        {title}
      </h2>
      {description ? (
        <div className="mt-[var(--ui-space-3)] text-[length:var(--ui-text-body)] leading-[var(--ui-leading-body)] text-muted-foreground">
          {description}
        </div>
      ) : null}
    </header>
  );
}
