import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

type PublicPageContainerProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  size?: "content" | "wide";
};

export function PublicPageContainer({
  children,
  className,
  size = "wide",
  ...props
}: PublicPageContainerProps) {
  const maxWidth =
    size === "content"
      ? "max-w-[var(--ui-container-content)]"
      : "max-w-[var(--ui-container-wide)]";

  return (
    <div
      className={cn(
        "mx-auto w-full px-[var(--ui-page-gutter)]",
        maxWidth,
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
