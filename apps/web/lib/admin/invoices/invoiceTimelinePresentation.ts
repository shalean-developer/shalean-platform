import type { LucideIcon } from "lucide-react";
import { CheckCircle2, CreditCard, FileText, Minus, MoreHorizontal, Plus, ShieldCheck } from "lucide-react";

export type InvoiceTimelineVisualKind = "finalize" | "payment" | "adjustment" | "closed" | "admin_pay" | "other";

export type InvoiceTimelineRow = {
  id: string;
  left: string;
  right: string;
  kind: InvoiceTimelineVisualKind;
  Icon: LucideIcon;
};

function inferKindFromDescription(description: string): InvoiceTimelineVisualKind {
  const d = description.toLowerCase();
  if (d.includes("invoice finalized")) return "finalize";
  if (d.includes("payment received")) return "payment";
  if (d.includes("adjustment applied")) return "adjustment";
  if (d.includes("invoice closed")) return "closed";
  if (d.includes("marked paid by admin")) return "admin_pay";
  return "other";
}

function iconFor(kind: InvoiceTimelineVisualKind, description: string): LucideIcon {
  switch (kind) {
    case "finalize":
      return FileText;
    case "payment":
      return CreditCard;
    case "adjustment": {
      if (/\(\s*-/.test(description) || /\(-R/.test(description)) return Minus;
      return Plus;
    }
    case "closed":
      return CheckCircle2;
    case "admin_pay":
      return ShieldCheck;
    default:
      return MoreHorizontal;
  }
}

/**
 * Splits human timeline lines (`May 31 – …`) into left date + right body for layout.
 * Icon kind is inferred from the English description produced by {@link buildInvoiceHumanTimeline}.
 */
export function splitHumanTimelineLines(lines: string[]): InvoiceTimelineRow[] {
  return lines.map((line, i) => {
    const sep = " – ";
    const idx = line.indexOf(sep);
    const left = idx >= 0 ? line.slice(0, idx).trim() : "";
    const right = idx >= 0 ? line.slice(idx + sep.length).trim() : line.trim();
    const desc = right || line;
    const kind = inferKindFromDescription(desc);
    return {
      id: `${i}-${left}-${desc.slice(0, 24)}`,
      left: left || "—",
      right: desc,
      kind,
      Icon: iconFor(kind, desc),
    };
  });
}
