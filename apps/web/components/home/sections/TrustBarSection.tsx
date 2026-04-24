import { ShieldCheck, Sparkles, Star, Users } from "lucide-react";

const items = [
  { icon: Star, title: "4.9 rating", subtitle: "From verified reviews" },
  { icon: Users, title: "Trusted by 500+ homes", subtitle: "Across Cape Town" },
  { icon: ShieldCheck, title: "Vetted cleaners", subtitle: "ID & reference checked" },
  { icon: Sparkles, title: "Satisfaction guarantee", subtitle: "Support if something is missed" },
] as const;

export function TrustBarSection() {
  return (
    <section aria-label="Trust and quality signals" className="border-b border-blue-100 bg-white py-6">
      <div className="mx-auto max-w-7xl px-4">
        <p className="mb-4 text-center text-sm font-semibold text-zinc-700">
          Trusted by homeowners, tenants, and Airbnb hosts across Cape Town
        </p>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {items.map(({ icon: Icon, title, subtitle }) => (
            <li key={title} className="flex items-center gap-3 rounded-xl border border-blue-100 bg-blue-50/50 px-4 py-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-blue-600 shadow-sm">
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <div>
                <p className="text-sm font-semibold text-zinc-900">{title}</p>
                <p className="text-xs text-gray-600">{subtitle}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
