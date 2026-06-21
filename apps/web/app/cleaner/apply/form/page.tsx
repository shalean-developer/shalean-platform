import type { Metadata } from "next";
import { CleanerApplyForm } from "@/components/cleaner/CleanerApplyForm";

export const metadata: Metadata = {
  title: "Cleaner Application Form | Shalean",
  description: "Submit your application to work as a Shalean cleaner in Cape Town.",
  robots: { index: false, follow: false },
};

export default function CleanerApplyFormPage() {
  return <CleanerApplyForm />;
}
