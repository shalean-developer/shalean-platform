import { ShieldCheck, Lock, BadgeCheck, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

const TRUST_ITEMS = [
  { icon: ShieldCheck, iconBg: "bg-blue-100", iconColor: "text-blue-600", label: "Vetted cleaners", sub: "Background checked" },
  { icon: Lock, iconBg: "bg-green-100", iconColor: "text-green-600", label: "Secure payments", sub: "100% secure" },
  { icon: BadgeCheck, iconBg: "bg-amber-100", iconColor: "text-amber-600", label: "Satisfaction guarantee", sub: "We make it right" },
  { icon: RefreshCw, iconBg: "bg-violet-100", iconColor: "text-violet-600", label: "Easy rescheduling", sub: "Reschedule anytime" },
];

export function TrustBar() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {TRUST_ITEMS.map(({ icon: Icon, iconBg, iconColor, label, sub }) => (
        <div key={label} className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", iconBg)}>
            <Icon className={cn("h-5 w-5", iconColor)} strokeWidth={1.75} />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-gray-900">{label}</p>
            <p className="truncate text-xs text-gray-500">{sub}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
