import type { Metadata } from "next";
import { FoundationScaleShowcase } from "./foundation-scale-showcase";
import { RDP01B5Showcase } from "./rd-p01b5-showcase";
import { UISystemShowcase } from "./ui-system-showcase";

export const metadata: Metadata = {
  title: "Shalean UI System",
  description: "Development-only visual catalogue for the Shalean reusable UI system.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function UISystemPage() {
  return (
    <>
      <FoundationScaleShowcase />
      <RDP01B5Showcase />
      <UISystemShowcase />
    </>
  );
}
