import { ShieldCheck, Lock, BadgeCheck, RefreshCw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const TRUST_ITEMS = [
  { icon: ShieldCheck, iconBg: "bg-blue-100", iconColor: "text-blue-600", label: "Vetted cleaners", sub: "Background checked" },
  { icon: Lock, iconBg: "bg-green-100", iconColor: "text-green-600", label: "Secure payments", sub: "100% secure" },
  { icon: BadgeCheck, iconBg: "bg-amber-100", iconColor: "text-amber-600", label: "Satisfaction guarantee", sub: "We make it right" },
  { icon: RefreshCw, iconBg: "bg-violet-100", iconColor: "text-violet-600", label: "Easy rescheduling", sub: "Reschedule anytime" },
];

export function TrustBar() {
  return (
    <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 xl:grid-cols-4">
      {TRUST_ITEMS.map(({ icon: Icon, iconBg, iconColor, label, sub }) => (
        <Card key={label} className="flex min-w-0 items-start gap-3 p-4">
          <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", iconBg)}>
            <Icon className={cn("h-5 w-5", iconColor)} strokeWidth={1.75} aria-hidden />
          </div>
          <div className="min-w-0 pt-0.5">
            <p className="text-sm font-semibold leading-tight text-foreground">{label}</p>
            <p className="mt-1 text-xs leading-snug text-muted-foreground">{sub}</p>
          </div>
        </Card>
      ))}
    </div>
  );
}
