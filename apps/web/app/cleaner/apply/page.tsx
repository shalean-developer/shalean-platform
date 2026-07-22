import type { Metadata } from "next";
import { CleanerApplyLanding } from "@/components/cleaner/CleanerApplyLanding";
import { buildCleanerApplyLandingMetadata } from "@/lib/seo/cleanerApplyLandingSeo";

export const metadata: Metadata = buildCleanerApplyLandingMetadata();

export default function CleanerApplyPage() {
  return <CleanerApplyLanding />;
}
