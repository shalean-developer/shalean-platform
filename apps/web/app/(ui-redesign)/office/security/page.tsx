import { ShieldCheck, Users, KeyRound, ScrollText } from "lucide-react";
import { OfficeSecurityAccessReview } from "@/src/features/office/OfficeSecurityAccessReview";
import { OfficeSecurityAuditLog } from "@/src/features/office/OfficeSecurityAuditLog";

const cards = [
  {
    title: "Admin roles",
    description: "Review role assignments, access scope, start dates, expiry dates and revocations.",
    icon: Users,
    status: "Live below",
  },
  {
    title: "Permissions",
    description: "Inspect the effective permissions granted through active role assignments.",
    icon: KeyRound,
    status: "Role details in access review",
  },
  {
    title: "Audit log",
    description: "Review immutable security and sensitive-action audit events.",
    icon: ScrollText,
    status: "Live below",
  },
];

export default function OfficeSecurityPage() {
  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="rounded-xl bg-emerald-50 p-3 text-emerald-700">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Owner access</p>
            <h1 className="mt-1 text-2xl font-bold text-slate-950">Security Center</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Central administration for Shalean Office roles, permissions, temporary access and security audit records.
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {cards.map(({ title, description, icon: Icon, status }) => (
          <article key={title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <Icon className="h-5 w-5 text-slate-700" />
            <h2 className="mt-4 font-semibold text-slate-950">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
            <p className="mt-4 text-xs font-medium text-emerald-700">{status}</p>
          </article>
        ))}
      </section>

      <OfficeSecurityAccessReview />
      <OfficeSecurityAuditLog />
    </div>
  );
}
