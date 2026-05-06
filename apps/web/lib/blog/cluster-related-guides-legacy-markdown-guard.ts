/**
 * Non-blocking guard: legacy in-body cluster “related guides” duplicated the footer.
 * Cluster continuation should stay canonical via `BlogClusterRelatedGuides` + DB fields.
 */
export const LEGACY_MANUAL_CLUSTER_RELATED_GUIDES_MARKDOWN = "## Related guides (Shalean cluster)";

function bodyBlobContainsLegacy(blob: unknown): boolean {
  if (blob == null) return false;
  if (typeof blob === "string") return blob.includes(LEGACY_MANUAL_CLUSTER_RELATED_GUIDES_MARKDOWN);
  try {
    return JSON.stringify(blob).includes(LEGACY_MANUAL_CLUSTER_RELATED_GUIDES_MARKDOWN);
  } catch {
    return false;
  }
}

/** True when markdown or serialized JSON (e.g. TipTap HTML in blocks) still embeds the legacy heading. */
export function serializedBlogBodyContainsLegacyManualClusterRelatedGuidesMarkdown(body: unknown): boolean {
  return bodyBlobContainsLegacy(body);
}

/**
 * Logs a single warning (non-blocking). Use after parsing `content_json` or when reading `content_markdown` seeds.
 */
export function warnIfSerializedBlogBodyContainsLegacyManualClusterRelatedGuidesMarkdown(
  body: unknown,
  ctx: { slug?: string; source?: string } = {},
): void {
  if (!bodyBlobContainsLegacy(body)) return;
  const slug = ctx.slug?.trim() ? ` slug=${ctx.slug.trim()}` : "";
  const source = ctx.source?.trim() ? ` source=${ctx.source.trim()}` : "";
  console.warn(
    `[blog][cluster-related-guides] Legacy in-body heading "${LEGACY_MANUAL_CLUSTER_RELATED_GUIDES_MARKDOWN}" detected.${slug}${source} Remove that section; cluster continuation is rendered in the article footer.`,
  );
}
