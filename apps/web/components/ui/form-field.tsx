import type { HTMLAttributes, ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type FormFieldProps = HTMLAttributes<HTMLDivElement> & {
  label?: ReactNode;
  htmlFor?: string;
  required?: boolean;
  helperText?: ReactNode;
  error?: ReactNode;
};

/**
 * Presentation-only field composition. Consumers remain responsible for wiring
 * aria-describedby / aria-errormessage on the actual form control when needed.
 */
export function FormField({
  className,
  label,
  htmlFor,
  required = false,
  helperText,
  error,
  children,
  ...props
}: FormFieldProps) {
  return (
    <div className={cn("space-y-[var(--ui-space-2)]", className)} {...props}>
      {label ? (
        <Label htmlFor={htmlFor}>
          {label}
          {required ? <span className="ml-1 text-destructive" aria-hidden>*</span> : null}
        </Label>
      ) : null}
      {children}
      {error ? (
        <p className="text-[length:var(--ui-text-caption)] font-medium text-destructive" role="alert">
          {error}
        </p>
      ) : helperText ? (
        <p className="text-[length:var(--ui-text-caption)] text-muted-foreground">{helperText}</p>
      ) : null}
    </div>
  );
}
