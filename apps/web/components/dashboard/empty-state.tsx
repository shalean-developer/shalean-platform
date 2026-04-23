import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
};

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <Card className={cn("rounded-2xl border-dashed border-zinc-300 bg-white/80 shadow-sm dark:border-zinc-600 dark:bg-zinc-900/50", className)}>
      <CardContent className="flex flex-col items-center justify-center px-6 py-14 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300">
          <Icon className="h-7 w-7" strokeWidth={1.5} />
        </div>
        <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{title}</p>
        <p className="mt-2 max-w-sm text-sm text-zinc-600 dark:text-zinc-400">{description}</p>
        {action ? <div className="mt-6 w-full max-w-xs">{action}</div> : null}
      </CardContent>
    </Card>
  );
}
