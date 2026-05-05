export type BlogServiceLinkKind = "deep" | "standard" | "airbnb" | "move-out" | "carpet" | "pricing";

/** Infer service focus from blog slug for contextual service cross-links. */
export function getBlogServiceType(slug: string): BlogServiceLinkKind {
  const s = slug.toLowerCase();
  if (s.includes("airbnb")) return "airbnb";
  if (s.includes("move-out")) return "move-out";
  if (s.includes("carpet")) return "carpet";
  if (s.includes("deep")) return "deep";
  if (s.includes("price") || s.includes("pricing") || s.includes("cost") || s.includes("how-much")) return "pricing";
  return "standard";
}
