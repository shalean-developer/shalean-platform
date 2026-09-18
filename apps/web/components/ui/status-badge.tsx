import type { HTMLAttributes } from "react";
import { Badge, type BadgeVariant } from "@/components/ui/badge";

export type StatusTone = "neutral" | "info" | "success" | "warning" | "critical";

const toneVariant: Record<StatusTone, BadgeVariant> = {
  neutral: "outline",
  info: "default",
  success: "success",
  warning: "warning",
  critical: "destructive",
};

/**
 * Canonical state-to-appearance wrapper. Domain-specific booking, payment,
 * workforce and other status mapping belongs in domain adapters.
 */
export function StatusBadge({
  tone = "neutral",
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: StatusTone }) {
  return <Badge variant={toneVariant[tone]} {...props} />;
}
