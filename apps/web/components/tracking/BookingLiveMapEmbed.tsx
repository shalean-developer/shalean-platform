"use client";

type Props = {
  lat: number;
  lng: number;
  /** Shown as iframe title / a11y. */
  label?: string;
  className?: string;
};

/**
 * Lightweight map embed (no JS Maps SDK). Center follows `lat`/`lng`.
 */
export function BookingLiveMapEmbed({ lat, lng, label = "Cleaner location", className }: Props) {
  const safeLat = Math.min(90, Math.max(-90, lat));
  const safeLng = Math.min(180, Math.max(-180, lng));
  const src = `https://www.google.com/maps?q=${encodeURIComponent(`${safeLat},${safeLng}`)}&z=16&output=embed`;
  const openHref = `https://www.google.com/maps?q=${encodeURIComponent(`${safeLat},${safeLng}`)}`;

  return (
    <div className={className}>
      <div className="aspect-video w-full max-h-[360px] overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900">
        <iframe title={label} className="h-full min-h-[220px] w-full border-0" loading="lazy" src={src} allowFullScreen />
      </div>
      <a
        href={openHref}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 inline-block text-sm font-medium text-blue-600 underline-offset-2 hover:underline dark:text-blue-400"
      >
        Open in Google Maps
      </a>
    </div>
  );
}
