import type { ReactNode } from "react";
import { WhatsAppTestSendCard } from "./WhatsAppTestSendCard";

export default function NotificationLogsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-5">
      <WhatsAppTestSendCard />
      {children}
    </div>
  );
}
