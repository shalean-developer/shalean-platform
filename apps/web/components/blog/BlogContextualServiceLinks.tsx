import Link from "next/link";
import { BLOG_CONTEXT_SERVICE_LINKS } from "@/lib/blog/blogServiceContextLinks";

const proseArticle =
  "prose prose-zinc max-w-3xl prose-headings:scroll-mt-24 prose-a:text-blue-600 prose-a:no-underline hover:prose-a:underline";

export function BlogContextualServiceLinks() {
  return (
    <div className={`${proseArticle} mt-12 border-t border-zinc-200 pt-10`}>
      <h2>Shalean cleaning services across Cape Town</h2>
      <p>
        Whether you manage{" "}
        <Link href={BLOG_CONTEXT_SERVICE_LINKS[3].href}>{BLOG_CONTEXT_SERVICE_LINKS[3].anchor}</Link>, run Airbnb
        turnover in busy pockets like Sea Point or the CBD, or keep a family home in Claremont, Rondebosch, Gardens, or
        the City Bowl on track, you can match scope to how you live. Many rentals and busy households start with{" "}
        <Link href={BLOG_CONTEXT_SERVICE_LINKS[0].href}>{BLOG_CONTEXT_SERVICE_LINKS[0].anchor}</Link>, then add{" "}
        <Link href={BLOG_CONTEXT_SERVICE_LINKS[1].href}>{BLOG_CONTEXT_SERVICE_LINKS[1].anchor}</Link> when kitchens,
        bathrooms, or detail zones need a reset. Hosts often pair{" "}
        <Link href={BLOG_CONTEXT_SERVICE_LINKS[2].href}>{BLOG_CONTEXT_SERVICE_LINKS[2].anchor}</Link> with occasional{" "}
        <Link href={BLOG_CONTEXT_SERVICE_LINKS[1].href}>deep cleaning</Link> between peak blocks. For soft floors after
        guests or high traffic, see{" "}
        <Link href={BLOG_CONTEXT_SERVICE_LINKS[4].href}>{BLOG_CONTEXT_SERVICE_LINKS[4].anchor}</Link>.
      </p>
    </div>
  );
}
