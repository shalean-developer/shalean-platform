import Link from "next/link";
import { getBlogAboveFoldServiceLink } from "@/lib/seo/internalLinks";
import { linkEmphasisClassName } from "@/lib/ui/linkClassNames";

type Props = { slug: string };

/** One contextual internal link in the header stack (above-the-fold crawl signal). */
export function BlogIntroServiceLink({ slug }: Props) {
  const { href, anchor } = getBlogAboveFoldServiceLink(slug);
  return (
    <p className="mt-4 text-base leading-relaxed text-zinc-700">
      Start here:{" "}
      <Link href={href} className={`font-semibold ${linkEmphasisClassName}`}>
        {anchor}
      </Link>{" "}
      — scope and totals lock online before we dispatch.
    </p>
  );
}
