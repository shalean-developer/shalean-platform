import Link from "next/link";
import { notFound } from "next/navigation";
import { marketingStagingEnabled } from "@/lib/email/marketingStagingFixture";
import { MarketingEmailPreferences } from "@/components/account/MarketingEmailPreferences";
export const dynamic = "force-dynamic";
export default function OfficeEmailPreferencesPage() {
  if (!marketingStagingEnabled()) notFound();
  return <div className="mx-auto max-w-3xl space-y-5 px-4 py-8">
    <p className="text-sm font-semibold">STAGING · SYNTHETIC ACCOUNT ONLY · NO EMAILS SENT</p>
    <h1 className="text-2xl font-bold">Manage email preferences</h1>
    <p className="text-sm">You are reviewing the reserved synthetic customer through your Owner account. Your personal email preferences are not changed. Customer accounts manage their own preferences in their profile.</p>
    <MarketingEmailPreferences mode="office" />
    <nav className="flex flex-wrap gap-4 text-sm font-semibold" aria-label="Email preference review">
      <Link className="underline" href="/office/marketing/email/test">Run the no-send journey</Link>
      <Link className="underline" href="/office/marketing/email">Back to email marketing</Link>
    </nav>
  </div>;
}
