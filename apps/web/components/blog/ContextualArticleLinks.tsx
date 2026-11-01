import { SafeInternalLink } from "@/components/links/SafeInternalLink";
import { programmaticBlogHrefIfExists } from "@/lib/blog/programmaticPosts";

type ArticleLink = { slug: string; label: string; programmatic?: boolean };

const ARTICLES_BY_PARENT: Record<string, readonly ArticleLink[]> = {
  "/services/deep-cleaning-cape-town": [
    { slug: "how-often-deep-clean-home-cape-town", label: "how often to deep clean your home" },
    { slug: "cleaning-mistakes-that-make-your-home-dirtier-cape-town", label: "cleaning mistakes to avoid between visits" },
  ],
  "/services/standard-cleaning-cape-town": [
    { slug: "weekly-cleaning-routine-busy-professionals-cape-town", label: "a weekly cleaning routine for busy households" },
    { slug: "is-it-worth-hiring-cleaner-cape-town", label: "when hiring a cleaner is worth it" },
  ],
  "/locations/sea-point-cleaning-services": [
    { slug: "apartment-cleaning-tips-sea-point-cape-town", label: "apartment cleaning tips for Sea Point", programmatic: true },
  ],
  "/locations/newlands-cleaning-services": [
    { slug: "standard-cleaning-newlands-cape-town", label: "standard cleaning in Newlands", programmatic: true },
  ],
  "/locations/observatory-cleaning-services": [
    { slug: "standard-cleaning-observatory-cape-town", label: "standard cleaning in Observatory", programmatic: true },
  ],
};

/** Contextual crawl paths; omit static programme guides when those routes are disabled. */
export function getContextualArticleLinks(parentPath: string) {
  return (ARTICLES_BY_PARENT[parentPath] ?? []).flatMap((article) => {
    const href = article.programmatic ? programmaticBlogHrefIfExists(article.slug) : `/blog/${article.slug}`;
    return href ? [{ href, label: article.label }] : [];
  });
}

export function ContextualArticleLinks({ parentPath }: { parentPath: string }) {
  const links = getContextualArticleLinks(parentPath);
  if (links.length === 0) return null;

  return (
    <p className="mt-4 text-base leading-relaxed text-zinc-600">
      Planning care between cleaning visits? Explore{" "}
      {links.map((link, index) => (
        <span key={link.href}>
          {index > 0 ? " and " : null}
          <SafeInternalLink href={link.href} className="font-semibold text-blue-700 underline-offset-2 hover:underline">
            {link.label}
          </SafeInternalLink>
        </span>
      ))}
      .
    </p>
  );
}
