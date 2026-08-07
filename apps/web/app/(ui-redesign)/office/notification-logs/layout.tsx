import type { ReactNode } from "react";
import { WhatsAppTestSendCard } from "./WhatsAppTestSendCard";
import { WhatsAppInbox } from "./WhatsAppInbox";

export default function NotificationLogsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-5">
      <WhatsAppTestSendCard />
      <WhatsAppInbox />
      {children}
    </div>
  );
}
