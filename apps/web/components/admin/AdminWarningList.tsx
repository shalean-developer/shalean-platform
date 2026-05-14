import type { AdminWarning } from "@/lib/admin/adminWarningPayload";

type Props = {
  warnings?: AdminWarning[] | null;
  className?: string;
  compact?: boolean;
};

const severityClass: Record<AdminWarning["severity"], string> = {
  critical: "border-rose-300 bg-rose-50 text-rose-950",
  high: "border-orange-300 bg-orange-50 text-orange-950",
  medium: "border-amber-300 bg-amber-50 text-amber-950",
  low: "border-blue-200 bg-blue-50 text-blue-950",
  info: "border-zinc-200 bg-zinc-50 text-zinc-800",
};

const badgeClass: Record<AdminWarning["severity"], string> = {
  critical: "bg-rose-100 text-rose-900 ring-rose-200",
  high: "bg-orange-100 text-orange-900 ring-orange-200",
  medium: "bg-amber-100 text-amber-900 ring-amber-200",
  low: "bg-blue-100 text-blue-900 ring-blue-200",
  info: "bg-zinc-100 text-zinc-700 ring-zinc-200",
};

function actionLabel(warning: AdminWarning): string {
  if (warning.blocking) return "Blocking";
  if (warning.action === "requires_confirmation") return "Needs confirmation";
  if (warning.action === "force_override_available") return "Override available";
  if (warning.action === "repair_available") return "Repair available";
  if (warning.action === "manual_review_required") return "Manual review";
  return "Advisory";
}

export function AdminWarningList({ warnings, className = "", compact = false }: Props) {
  const list = (warnings ?? []).filter(Boolean);
  if (list.length === 0) return null;

  return (
    <div className={["space-y-2", className].filter(Boolean).join(" ")} data-testid="admin-warning-list">
      {list.map((warning, index) => (
        <div
          key={`${warning.code}-${index}`}
          className={[
            "rounded-lg border px-3 py-2 text-sm",
            severityClass[warning.severity] ?? severityClass.medium,
          ].join(" ")}
          data-warning-code={warning.code}
        >
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={[
                "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1",
                badgeClass[warning.severity] ?? badgeClass.medium,
              ].join(" ")}
            >
              {warning.severity}
            </span>
            <span className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ring-black/10">
              {actionLabel(warning)}
            </span>
            <span className="font-mono text-[10px] opacity-70">{warning.code}</span>
          </div>
          <p className={compact ? "mt-1 text-xs leading-snug" : "mt-2 leading-snug"}>{warning.message}</p>
          {!compact && warning.fields && warning.fields.length > 0 ? (
            <p className="mt-1 font-mono text-[10px] opacity-70">Fields: {warning.fields.join(", ")}</p>
          ) : null}
        </div>
      ))}
    </div>
  );
}
