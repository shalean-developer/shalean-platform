import type { ReactNode } from "react";
import { OfficeShell } from "@/src/features/office/OfficeShell";
import { AppMonoFontScope } from "@/components/fonts/AppMonoFontScope";

export const metadata = {
  title: "Office | Shalean Admin",
  description: "Operations console for managing bookings, workforce, and growth.",
  robots: { index: false, follow: false },
};

export default function OfficeLayout({ children }: { children: ReactNode }) {
  return (
    <AppMonoFontScope>
      <OfficeShell>{children}</OfficeShell>
    </AppMonoFontScope>
  );
}
