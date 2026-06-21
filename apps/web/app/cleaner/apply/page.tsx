import type { Metadata } from "next";
import { CleanerApplyLanding } from "@/components/cleaner/CleanerApplyLanding";

export const metadata: Metadata = {
  title: "Apply as a Cleaner | Shalean Cape Town",
  description:
    "Join Shalean as a cleaner in Cape Town. Flexible hours, weekly payouts, and jobs near you. Learn more and apply online.",
};

export default function CleanerApplyPage() {
  return <CleanerApplyLanding />;
}
