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
  default: "py-14 md:py-20",
  tight: "py-10 md:py-12",
} as const;

/**
 * Marketing / hub content width (~1100px) — use with landing pages, `/services`, etc.
 */
export function Section({ children, className, spacing = "default", as: Tag = "div", id, "aria-labelledby": labelledBy }: Props) {
  return (
    <Tag
      id={id}
      aria-labelledby={labelledBy}
      className={cn("mx-auto w-full max-w-[1100px] px-4 sm:px-6", spacingClass[spacing], className)}
    >
      {children}
    </Tag>
  );
}
