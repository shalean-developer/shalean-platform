import { SafeInternalLink } from "@/components/links/SafeInternalLink";
import { BLOG_CONTEXT_SERVICE_LINKS } from "@/lib/blog/blogServiceContextLinks";

const proseArticle =
  "prose prose-zinc max-w-3xl prose-headings:scroll-mt-24 prose-a:text-slate-700 prose-a:no-underline prose-a:transition-colors prose-a:duration-200 hover:prose-a:text-blue-600 hover:prose-a:underline prose-a:underline-offset-4";

type Props = {
  /** When true, omit the top rule + extra margin (parent section already provides separation). */
  embedded?: boolean;
};

export function BlogContextualServiceLinks({ embedded = false }: Props) {
  const [standard, deep, airbnb, moveOut] = BLOG_CONTEXT_SERVICE_LINKS;
  return (
    <div
      className={`${proseArticle} ${embedded ? "mt-0 border-0 pt-0" : "mt-12 border-t border-zinc-200 pt-10"}`}
    >
      <h2>Trusted cleaning services across Cape Town with upfront pricing</h2>
      <p>
        Whether you need{" "}
        <SafeInternalLink href={moveOut.href}>{moveOut.anchor}</SafeInternalLink>, Airbnb turnover in busy areas like Sea Point or the CBD, or
        regular home cleaning in Claremont, Rondebosch, or Gardens, you can match the service to your needs. Many
        households start with{" "}
        <SafeInternalLink href={standard.href}>{standard.anchor}</SafeInternalLink> and add{" "}
        <SafeInternalLink href={deep.href}>{deep.anchor}</SafeInternalLink> when kitchens, bathrooms, or high-use areas need extra attention.
        Hosts often combine <SafeInternalLink href={airbnb.href}>Airbnb cleaning</SafeInternalLink> with occasional{" "}
        <SafeInternalLink href={deep.href}>deep cleans</SafeInternalLink> between peak bookings.
      </p>
    </div>
  );
}
