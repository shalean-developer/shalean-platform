import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  step: string;
  title: string;
  description: string;
  icon: LucideIcon;
  className?: string;
};

/** Numbered how-we-work row with icon. */
export function StepItem({ step, title, description, icon: Icon, className }: Props) {
  return (
    <div className={cn("relative rounded-2xl border border-zinc-200 bg-zinc-50/80 p-6 shadow-sm", className)}>
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">
          {step}
        </span>
        <Icon className="size-6 text-blue-800" strokeWidth={1.75} aria-hidden />
      </div>
      <h3 className="mt-4 text-lg font-bold text-zinc-900">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-zinc-600">{description}</p>
    </div>
  );
}
