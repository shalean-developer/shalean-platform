import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type HomeFeatureCardProps = {
  icon?: LucideIcon;
  title: string;
  children: ReactNode;
  className?: string;
};

export function HomeFeatureCard({ icon: Icon, title, children, className }: HomeFeatureCardProps) {
  return (
    <article
      className={cn(
        "rounded-[var(--ui-radius-xl)] border border-border bg-card p-[var(--ui-space-5)] text-card-foreground shadow-[var(--ui-shadow-sm)]",
        className,
      )}
    >
      {Icon ? (
        <div className="mb-[var(--ui-space-4)] flex h-10 w-10 items-center justify-center rounded-[var(--ui-radius-lg)] bg-primary/10 text-primary">
          <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
        </div>
      ) : null}
      <h3 className="text-[length:var(--ui-text-card-title)] font-semibold leading-[var(--ui-leading-tight)] text-foreground">
        {title}
      </h3>
      <div className="mt-[var(--ui-space-2)] text-[length:var(--ui-text-small)] leading-[var(--ui-leading-body)] text-muted-foreground">
        {children}
      </div>
    </article>
  );
}
