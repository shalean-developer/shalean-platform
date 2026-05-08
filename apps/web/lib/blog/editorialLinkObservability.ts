/**
 * Optional counters for editorial href governance.
 * Disabled unless `EDITORIAL_LINK_OBSERVABILITY=1` or `SEO_ROUTE_TELEMETRY=1`.
 */

let normalizedCount = 0;
let redirectAliasInputCount = 0;
let rejectedCount = 0;
let orphanReferenceCount = 0;

export function resetEditorialLinkObservability(): void {
  normalizedCount = 0;
  redirectAliasInputCount = 0;
  rejectedCount = 0;
  orphanReferenceCount = 0;
}

/** Aggregation-safe counters (no per-URL logging). */
export function getEditorialLinkObservabilitySnapshot(): {
  normalized: number;
  redirectAliasInputs: number;
  rejected: number;
  orphanReferences: number;
} {
  return {
    normalized: normalizedCount,
    redirectAliasInputs: redirectAliasInputCount,
    rejected: rejectedCount,
    orphanReferences: orphanReferenceCount,
  };
}

/** Alias names for dashboards — map to {@link getEditorialLinkObservabilitySnapshot}. */
export function getBlogRouteTelemetrySnapshot(): {
  canonicalRewrites: number;
  invalidInternalLinks: number;
  rejectedAliases: number;
  orphanReferences: number;
} {
  const s = getEditorialLinkObservabilitySnapshot();
  return {
    canonicalRewrites: s.normalized,
    invalidInternalLinks: s.rejected,
    rejectedAliases: s.redirectAliasInputs,
    orphanReferences: s.orphanReferences,
  };
}

function enabled(): boolean {
  return (
    process.env.EDITORIAL_LINK_OBSERVABILITY === "1" || process.env.SEO_ROUTE_TELEMETRY === "1"
  );
}

export function noteEditorialHrefNormalized(from: string, to: string): void {
  if (!enabled() || from === to) return;
  normalizedCount += 1;
}

export function noteEditorialRedirectAliasInput(_pathOrHref: string): void {
  if (!enabled()) return;
  redirectAliasInputCount += 1;
}

export function noteEditorialHrefRejected(_reason: string): void {
  if (!enabled()) return;
  rejectedCount += 1;
}

/** Uncatalogued static references (optional hooks from audits / CMS validators). */
export function noteEditorialOrphanReference(): void {
  if (!enabled()) return;
  orphanReferenceCount += 1;
}
