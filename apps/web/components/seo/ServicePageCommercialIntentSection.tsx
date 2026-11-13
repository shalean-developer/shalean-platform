import Link from "next/link";
import type { CapeTownSeoServiceSlug } from "@/lib/seo/capeTownSeoPages";
import { CAPE_TOWN_PRICING_AUTHORITY_HREF } from "@/lib/seo/internalLinks";
import { SERVICE_DECISION_COPY } from "@/lib/seo/serviceDecisionCopy";
export { SERVICE_DECISION_COPY } from "@/lib/seo/serviceDecisionCopy";

const linkClass = "font-semibold text-blue-700 underline-offset-2 hover:underline";

/** Each service answers its own booking decision instead of repeating a residential comparison block. */
export function ServicePageCommercialIntentSection({ slug }: { slug: CapeTownSeoServiceSlug }) {
  const copy = SERVICE_DECISION_COPY[slug];
  const headingId = `svc-commercial-${slug}-heading`;
  return (
    <section className="border-b border-blue-100 bg-blue-50/35 py-14" aria-labelledby={headingId}>
      <div className="mx-auto max-w-4xl px-4">
        <h2 id={headingId} className="text-2xl font-bold tracking-tight text-zinc-900">{copy.heading}</h2>
        <p className="mt-4 text-base leading-relaxed text-zinc-600">{copy.intro}</p>
        <ul className="mt-6 space-y-2 text-base leading-relaxed text-zinc-700">
          {copy.checklist.map((item) => <li key={item}>{item}</li>)}
        </ul>
        <p className="mt-6 text-base leading-relaxed text-zinc-600">
          <Link href={CAPE_TOWN_PRICING_AUTHORITY_HREF} className={linkClass}>Compare cleaning prices</Link>{" "}
          and <Link href="/services" className={linkClass}>service scopes</Link>, then{" "}
          <Link href={slug === "window-cleaning-cape-town" ? "/quote" : "/book"} className={linkClass}>
            {slug === "window-cleaning-cape-town" ? "request a quote" : "book online"}
          </Link>. Check the selected work and total before confirming.
        </p>
        {slug === "move-out-cleaning-cape-town" ? (
          <p className="mt-4 text-base leading-relaxed text-zinc-600">
            Need help agreeing the handover scope?{" "}
            <Link href="/quote" className={linkClass}>Request a personalised quote</Link>.{" "}
            Share your property size, condition, access arrangements and handover deadline. No payment is required to request a quote.
          </p>
        ) : null}
        <p className="mt-4 text-sm text-zinc-600"><Link href="/reviews" className={linkClass}>Read customer reviews</Link>.</p>
      </div>
    </section>
  );
}
