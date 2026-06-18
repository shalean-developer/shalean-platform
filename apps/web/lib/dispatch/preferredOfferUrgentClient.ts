import { todayYmdJohannesburg } from "@/lib/booking/dateInJohannesburg";

const URGENT_TTL_MINUTES_RELAXED = 20;

/** Client-safe preferred-offer urgency badge (no server-only dispatch imports). */
export function isPreferredOfferUrgent(params: {
  dateYmd: string;
  timeHm: string;
  bookingPriority?: string | null;
  expiresAt: Date;
  sentAt: Date;
}): boolean {
  const today = todayYmdJohannesburg(params.sentAt);
  const isSameDay = params.dateYmd.trim().slice(0, 10) === today;
  const isAdminUrgent = String(params.bookingPriority ?? "").trim().toLowerCase() === "high";
  if (isSameDay || isAdminUrgent) return true;
  const ttlMinutes = (params.expiresAt.getTime() - params.sentAt.getTime()) / 60_000;
  return ttlMinutes <= URGENT_TTL_MINUTES_RELAXED + 1;
}
