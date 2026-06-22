import { deferredGrowthCtaTrackingInlineScript } from "@/lib/analytics/deferredGrowthCtaTrackingScript";

/** Restores `start_booking` beacons for server-rendered growth CTAs (`data-growth-cta-source`). */
export function DeferredGrowthCtaTracking() {
  return <script dangerouslySetInnerHTML={{ __html: deferredGrowthCtaTrackingInlineScript() }} />;
}
