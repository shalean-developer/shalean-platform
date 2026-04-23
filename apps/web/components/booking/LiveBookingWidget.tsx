"use client";

import { useCallback, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BookingDateTimeSection } from "@/components/booking/BookingDateTimeSection";
import { ROOM_FIELD_LABEL_CLASS, ROOM_TEXT_INPUT_CLASS } from "@/components/ui/floating-select";
import { WidgetServicePicker } from "@/components/booking/WidgetServicePicker";
import { cn } from "@/lib/utils";
import { BOOKING_DATA_STORAGE_KEY } from "@/lib/booking/bookingWidgetDraft";
import { defaultBookingTimeForDate, todayBookingYmd } from "@/lib/booking/bookingTimeSlots";
import {
  calculateLiveWidgetBaseEstimateZar,
  calculateLiveWidgetPrice,
  type HomeWidgetServiceKey,
  type LiveWidgetPersistedState,
  type LiveWidgetPriceInput,
  slotsLeftForWidgetDate,
} from "@/lib/booking/liveWidgetPricing";

export type LiveBookingWidgetProps = {
  className?: string;
  /** Query param appended to booking URL (e.g. hero vs footer). */
  source?: string;
};

export function LiveBookingWidget({ className, source = "live_widget" }: LiveBookingWidgetProps) {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const isEstimateMode = pathname === "/";

  const bedrooms = 2;
  const bathrooms = 1;
  const extraRooms = 0;
  const [service, setService] = useState<HomeWidgetServiceKey>("standard");
  const [date, setDate] = useState(() => todayBookingYmd());
  const [time, setTime] = useState<string>(() => defaultBookingTimeForDate(todayBookingYmd()));
  const [location, setLocation] = useState("");
  const extras = useMemo<string[]>(() => [], []);

  const priceInput: LiveWidgetPriceInput = useMemo(
    () => ({ bedrooms, bathrooms, extraRooms, service, extras }),
    [bedrooms, bathrooms, extraRooms, service, extras],
  );

  const baseEstimate = useMemo(() => calculateLiveWidgetBaseEstimateZar(service), [service]);
  const fullQuoteForNonHome = useMemo(() => calculateLiveWidgetPrice(priceInput), [priceInput]);
  const displayEstimate = isEstimateMode ? baseEstimate : fullQuoteForNonHome;

  const slotsLeft = useMemo(() => slotsLeftForWidgetDate(date), [date]);

  function handleBook() {
    const payload: LiveWidgetPersistedState = isEstimateMode
      ? {
          estimateOnly: true,
          service,
          date,
          time,
          extras: [],
          location: location.trim().slice(0, 500),
          quotedPriceZar: baseEstimate,
          savedAt: new Date().toISOString(),
        }
      : {
          bedrooms,
          bathrooms,
          extraRooms,
          service,
          date,
          time,
          extras: [...extras],
          location: location.trim().slice(0, 500),
          quotedPriceZar: fullQuoteForNonHome,
          savedAt: new Date().toISOString(),
        };
    try {
      localStorage.setItem(BOOKING_DATA_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      /* ignore quota / private mode */
    }
    const q = new URLSearchParams();
    if (source) q.set("source", source);
    router.push(q.size ? `/booking?${q.toString()}` : "/booking");
  }

  const onWidgetDateChange = useCallback((ymd: string) => setDate(ymd), []);
  const onWidgetTimeChange = useCallback((hm: string) => setTime(hm), []);

  return (
    <Card
      className={cn(
        "w-full rounded-2xl border-zinc-200 bg-white shadow-md dark:border-zinc-800 dark:bg-zinc-900",
        className,
      )}
    >
      <CardHeader className="space-y-1 p-6 pb-2">
        <CardTitle className="text-xl sm:text-2xl">Book home cleaning</CardTitle>
        <CardDescription className="text-base">
          {isEstimateMode
            ? "Pick service, date & time — you’ll confirm rooms and add-ons on the next page."
            : "Service & time now; rooms & extras at checkout. Estimate only."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 p-6 pt-2">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="live-widget-location" className={cn("block", ROOM_FIELD_LABEL_CLASS)}>
              Address or area (optional)
            </label>
            <input
              id="live-widget-location"
              type="text"
              autoComplete="street-address"
              placeholder="e.g. Sea Point, Cape Town"
              value={location}
              onChange={(e) => setLocation(e.target.value.slice(0, 500))}
              className={ROOM_TEXT_INPUT_CLASS}
            />
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Confirm full address when you book.</p>
          <WidgetServicePicker
            value={service}
            onChange={setService}
            labelId="live-widget-service-type-label"
            className="w-full min-w-0"
          />
        </div>

        <BookingDateTimeSection
          key={date}
          date={date}
          time={time}
          onDateChange={onWidgetDateChange}
          onTimeChange={onWidgetTimeChange}
          minDateYmd={todayBookingYmd()}
          dateTriggerId="live-widget-date"
        />

        <p className="flex items-center justify-center gap-2 text-center text-sm font-medium text-amber-800 dark:text-amber-200">
          <Zap className="size-4 shrink-0" aria-hidden />
          {slotsLeft} slots left this date—book soon
        </p>

        <div className="grid grid-cols-2 gap-2 sm:gap-3">
          <div className="flex min-w-0 flex-col justify-center rounded-xl border border-green-200 bg-green-50/90 px-2.5 py-2.5 text-center dark:border-emerald-800 dark:bg-emerald-950/40 sm:px-3 sm:py-3">
            {isEstimateMode ? (
              <>
                <p className="text-[10px] font-medium uppercase tracking-wide text-emerald-800 sm:text-xs dark:text-emerald-300">
                  From
                </p>
                <p className="text-lg font-semibold tabular-nums leading-none text-green-700 dark:text-emerald-300 sm:text-xl">
                  R{displayEstimate.toLocaleString("en-ZA")}
                </p>
                <p className="mt-1 text-[10px] leading-snug text-zinc-500 dark:text-zinc-400 sm:text-xs">
                  Estimated starting price. Final price confirmed in next step.
                </p>
              </>
            ) : (
              <>
                <p className="text-[10px] font-medium uppercase tracking-wide text-emerald-800 sm:text-xs dark:text-emerald-300">
                  Total price
                </p>
                <p className="mt-0.5 text-lg font-bold tabular-nums leading-none text-zinc-900 sm:text-xl dark:text-zinc-50">
                  R{displayEstimate.toLocaleString("en-ZA")}
                </p>
              </>
            )}
          </div>
          <Button
            type="button"
            size="default"
            onClick={handleBook}
            className="h-full min-h-[2.75rem] min-w-0 rounded-xl px-2 text-sm font-bold leading-snug shadow-md sm:min-h-12 sm:px-3 sm:text-base"
          >
            Book This Cleaning
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
