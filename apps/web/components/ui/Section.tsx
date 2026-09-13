import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Element = "section" | "div";

type Props = {
  children: ReactNode;
  className?: string;
  spacing?: "default" | "tight";
  /** Layout primitive — use `section` when wrapping an explicit page region. */
  as?: Element;
  id?: string;
  "aria-labelledby"?: string;
};

const spacingClass = {
  default: "py-[var(--ui-space-10)] md:py-[var(--ui-space-20)]",
  tight: "py-[var(--ui-space-8)] md:py-[var(--ui-space-12)]",
} as const;

/**
 * Canonical public/content container. Keep page-specific overrides in className when a surface needs a narrower width.
 */
export function Section({ children, className, spacing = "default", as: Tag = "div", id, "aria-labelledby": labelledBy }: Props) {
  return (
    <Tag
      id={id}
      aria-labelledby={labelledBy}
      className={cn(
        "mx-auto w-full max-w-[var(--ui-container-content)] px-[var(--ui-page-gutter)]",
        spacingClass[spacing],
        className,
      )}
    >
      {children}
    </Tag>
  );
}
