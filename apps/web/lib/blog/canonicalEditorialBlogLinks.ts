/**
 * Canonical `/blog/*` paths that exist in the live router (Supabase, HC pool, Airbnb host guides, or programmatic).
 * Legacy `lib/blog/posts.ts` slugs are NOT rendered unless published in `blog_posts` — prefer these constants in TSX.
 */
export const CANONICAL_DEEP_VS_STANDARD_BLOG_HREF = "/blog/deep-cleaning-vs-regular-cleaning-cape-town";

/** High-conversion article (same slug as legacy filename intent). */
export const CANONICAL_MOVE_OUT_CHECKLIST_BLOG_HREF = "/blog/move-out-cleaning-checklist-cape-town";

/** Airbnb host guide (supersedes generic editorial checklist slug when legacy rows are absent). */
export const CANONICAL_AIRBNB_CHECKLIST_CAPE_TOWN_HREF = "/blog/airbnb-cleaning-checklist-cape-town";

export const CANONICAL_BEST_AIRBNB_TIPS_CAPE_TOWN_HREF = "/blog/best-airbnb-cleaning-tips-cape-town";
