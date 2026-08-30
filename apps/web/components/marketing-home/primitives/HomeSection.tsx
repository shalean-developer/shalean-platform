import type { HTMLAttributes, ReactNode } from "react";
import { PublicPageContainer } from "@/components/nav/PublicPageContainer";
import { cn } from "@/lib/utils";

type HomeSectionProps = HTMLAttributes<HTMLElement> & {
  children: ReactNode;
  containerSize?: "content" | "wide" | "marketing";
  tone?: "default" | "muted" | "brand";
};

const toneClass = {
  default: "bg-background text-foreground",
  muted: "bg-muted/40 text-foreground",
  brand: "bg-primary text-primary-foreground",
} as const;

export function HomeSection({
  children,
  className,
  containerSize = "wide",
  tone = "default",
  ...props
}: HomeSectionProps) {
  return (
    <section
      className={cn(
        "py-[var(--ui-space-12)] md:py-[var(--ui-space-16)]",
        toneClass[tone],
        className,
      )}
      {...props}
    >
      <PublicPageContainer size={containerSize}>{children}</PublicPageContainer>
    </section>
  );
}
