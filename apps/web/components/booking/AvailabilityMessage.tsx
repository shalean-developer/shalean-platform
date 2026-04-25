"use client";

type AvailabilitySlot = {
  time: string;
};

type AvailabilityMessageProps = {
  slots?: AvailabilitySlot[];
  showExactTime?: boolean;
  lowAvailabilityThreshold?: number;
  className?: string;
};

function formatSlotTimeLabel(time: string): string {
  const [hRaw, mRaw] = time.split(":");
  const h = Number(hRaw);
  const m = Number(mRaw);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return time;
  const date = new Date();
  date.setHours(h, m, 0, 0);
  return date.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit", hour12: false });
}

export function AvailabilityMessage({
  slots,
  showExactTime = false,
  lowAvailabilityThreshold = 3,
  className,
}: AvailabilityMessageProps) {
  const availableCount = Array.isArray(slots) ? slots.length : 0;
  const firstSlot = availableCount > 0 ? slots![0] : null;

  if (!firstSlot || !showExactTime) {
    return <p className={className ?? "text-sm text-green-600"}>✔ Slots available today</p>;
  }

  return (
    <div className={className ?? "space-y-1"}>
      <p className="text-sm text-green-600">Next available: {formatSlotTimeLabel(firstSlot.time)}</p>
      {availableCount <= lowAvailabilityThreshold ? (
        <p className="text-sm text-orange-600">Only {availableCount} slots left today</p>
      ) : null}
      <p className="text-xs text-zinc-500 dark:text-zinc-400">Choose a time to lock your price</p>
    </div>
  );
}

