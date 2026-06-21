"use client";

import { cn } from "@/lib/utils";
import { YesNoToggle } from "@/src/features/booking-v2/components/YesNoToggle";

type YesNoToggleRowProps = {
  label: React.ReactNode;
  hint?: string;
  required?: boolean;
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  disabled?: boolean;
  error?: string;
  className?: string;
  bordered?: boolean;
};

export function YesNoToggleRow({
  label,
  hint,
  required,
  checked,
  onCheckedChange,
  disabled,
  error,
  className,
  bordered = true,
}: YesNoToggleRowProps) {
  return (
    <div
      className={cn(
        bordered && "border-b border-slate-100 pb-3",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-slate-800">
            {label}
            {required ? <span className="ml-0.5 text-red-500">*</span> : null}
          </p>
          {hint ? <p className="mt-0.5 text-xs text-slate-400">{hint}</p> : null}
        </div>
        <YesNoToggle
          checked={checked}
          onCheckedChange={onCheckedChange}
          disabled={disabled}
          aria-label={typeof label === "string" ? label : undefined}
        />
      </div>
      {error ? <p className="mt-1 text-xs text-red-500">{error}</p> : null}
    </div>
  );
}
