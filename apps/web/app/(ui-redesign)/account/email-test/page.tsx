import { notFound } from "next/navigation";
import { marketingStagingEnabled } from "@/lib/email/marketingStagingFixture";
import { MarketingEmailStagingJourney } from "@/components/account/MarketingEmailStagingJourney";

export const dynamic = "force-dynamic";
export default function EmailTestPage() {
  if (!marketingStagingEnabled()) notFound();
  return <MarketingEmailStagingJourney />;
}
