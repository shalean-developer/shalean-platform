import type { ReactNode } from "react";
import { AppMonoFontScope } from "@/components/fonts/AppMonoFontScope";
import { AccountShell } from "@/src/features/account/AccountShell";

export const metadata = {
  title: "My Account | Shalean Cleaning Services",
  description: "Manage your bookings, invoices, properties, and account settings.",
  robots: { index: false, follow: false },
};

export default function AccountLayout({ children }: { children: ReactNode }) {
  return (
    <AppMonoFontScope>
      <AccountShell>{children}</AccountShell>
    </AppMonoFontScope>
  );
}
