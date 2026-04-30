"use client";

import { forwardRef, useState, type ComponentPropsWithoutRef } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

export type PasswordInputProps = Omit<ComponentPropsWithoutRef<typeof Input>, "type"> & {
  /** Classes on the outer wrapper (e.g. `mt-1`). */
  wrapperClassName?: string;
};

/**
 * Password field with a show/hide control so users can verify what they typed (login / signup / change password).
 */
export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(function PasswordInput(
  { className, wrapperClassName, autoComplete = "current-password", ...props },
  ref,
) {
  const [show, setShow] = useState(false);
  return (
    <div className={cn("relative", wrapperClassName)}>
      <Input
        ref={ref}
        type={show ? "text" : "password"}
        autoComplete={autoComplete}
        className={cn("pr-10", className)}
        {...props}
      />
      <button
        type="button"
        className={cn(
          "absolute right-1.5 top-1/2 z-[1] -translate-y-1/2 rounded-md p-1.5 text-zinc-500 outline-none",
          "hover:bg-zinc-100 hover:text-zinc-800 focus-visible:ring-2 focus-visible:ring-blue-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-200",
        )}
        onClick={() => setShow((v) => !v)}
        aria-label={show ? "Hide password" : "Show password"}
        aria-pressed={show}
        tabIndex={-1}
      >
        {show ? <EyeOff className="h-4 w-4 shrink-0" aria-hidden /> : <Eye className="h-4 w-4 shrink-0" aria-hidden />}
      </button>
    </div>
  );
});

PasswordInput.displayName = "PasswordInput";
