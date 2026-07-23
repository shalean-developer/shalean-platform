import type { Metadata } from "next";
import { CleanerApplyForm } from "@/components/cleaner/CleanerApplyForm";
import { buildCleanerApplyFormMetadata } from "@/lib/seo/cleanerApplyLandingSeo";

export const metadata: Metadata = buildCleanerApplyFormMetadata();

export default function CleanerApplyFormPage() {
  return <CleanerApplyForm />;
}
