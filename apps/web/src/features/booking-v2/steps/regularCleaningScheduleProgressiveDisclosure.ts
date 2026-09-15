import type { BookingV2FormData } from "@/src/features/booking-v2/types";

export type RegularCleaningScheduleStage =
  | "booking_type"
  | "date_time"
  | "recurring_schedule"
  | "cleaner";

export function regularCleaningScheduleStages(
  bookingType: BookingV2FormData["bookingType"],
): readonly RegularCleaningScheduleStage[] {
  return bookingType === "recurring"
    ? ["booking_type", "date_time", "recurring_schedule", "cleaner"]
    : ["booking_type", "date_time", "cleaner"];
}

export function adjacentRegularCleaningScheduleStage(
  stage: RegularCleaningScheduleStage,
  direction: "back" | "next",
  bookingType: BookingV2FormData["bookingType"],
): RegularCleaningScheduleStage | null {
  const stages = regularCleaningScheduleStages(bookingType);
  const currentIndex = stages.indexOf(stage);
  const adjacentIndex = direction === "back" ? currentIndex - 1 : currentIndex + 1;
  return stages[adjacentIndex] ?? null;
}

export function isRegularCleaningScheduleStageComplete(
  stage: RegularCleaningScheduleStage,
  currentStage: RegularCleaningScheduleStage,
  bookingType: BookingV2FormData["bookingType"],
): boolean {
  const stages = regularCleaningScheduleStages(bookingType);
  return stages.indexOf(stage) < stages.indexOf(currentStage);
}
