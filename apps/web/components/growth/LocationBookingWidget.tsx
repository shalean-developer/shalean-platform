"use client";

import dynamic from "next/dynamic";

const HeroBookingWidgetCard = dynamic(
  () => import("@/components/home/HeroBookingWidgetCard").then((mod) => mod.HeroBookingWidgetCard),
  {
    ssr: false,
    loading: () => (
      <div className="w-full max-w-md rounded-2xl border border-blue-100 bg-white p-6 shadow-xl shadow-blue-900/10">
        <div className="h-6 w-28 animate-pulse rounded bg-blue-100" />
        <div className="mt-4 h-11 animate-pulse rounded-xl bg-blue-50" />
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div className="h-11 animate-pulse rounded-xl bg-blue-50" />
          <div className="h-11 animate-pulse rounded-xl bg-blue-50" />
        </div>
        <div className="mt-4 h-20 animate-pulse rounded-xl bg-blue-50" />
      </div>
    ),
  },
);

export function LocationBookingWidget() {
  return <HeroBookingWidgetCard />;
}
