import type { Metadata } from "next";
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
  return <UISystemShowcase />;
}
