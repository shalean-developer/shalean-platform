import { Bell, BellOff, BellRing } from "lucide-react";

type HeaderProps = {
  firstName?: string;
  notificationPermission?: "default" | "granted" | "denied" | "unsupported";
};

export function Header({ firstName = "there", notificationPermission = "unsupported" }: HeaderProps) {
  const BellIcon =
    notificationPermission === "granted" ? BellRing : notificationPermission === "denied" ? BellOff : Bell;
  const bellTitle =
    notificationPermission === "granted"
      ? "Notifications on — we’ll alert you instantly"
      : notificationPermission === "denied"
        ? "Browser notifications blocked"
        : notificationPermission === "default"
          ? "Browser notifications not enabled yet"
          : "Notifications";

  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Hi, {firstName} <span aria-hidden>👋</span>
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">Here&apos;s what matters right now.</p>
      </div>
      <div
        className={
          notificationPermission === "granted"
            ? "flex size-10 shrink-0 items-center justify-center rounded-xl border-2 border-emerald-500/45 bg-emerald-500/10 text-emerald-800 dark:text-emerald-100"
            : "flex size-10 shrink-0 items-center justify-center rounded-xl border border-border bg-muted/40 text-muted-foreground"
        }
        title={bellTitle}
        aria-label={bellTitle}
      >
        <BellIcon className="size-5" aria-hidden />
      </div>
    </div>
  );
}
