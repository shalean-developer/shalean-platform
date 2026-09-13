import { SiteFooter } from "@/components/nav/SiteFooter";

/**
 * Compatibility wrapper for existing marketing-home imports.
 * RD-P02C establishes SiteFooter as the canonical public footer while allowing
 * current page ownership to migrate incrementally rather than in one broad change.
 */
export function FooterSection({ stackFloats = false }: { stackFloats?: boolean }) {
  return <SiteFooter stackFloats={stackFloats} />;
}
