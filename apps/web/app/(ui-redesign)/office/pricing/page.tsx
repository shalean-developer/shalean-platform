import { OfficePricingPageView } from "@/components/office/pricing/OfficePricingPageView";
import { PricingExtraServiceAssignments } from "@/components/office/pricing/PricingExtraServiceAssignments";

export default function PricingPage() {
  return (
    <div className="space-y-5">
      <OfficePricingPageView />
      <PricingExtraServiceAssignments />
    </div>
  );
}
