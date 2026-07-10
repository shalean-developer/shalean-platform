export { BOOKING_QUOTE_ENGINE_VERSION } from "@/lib/booking/quote/bookingQuoteEngineVersion";
export {
  BookingQuoteSyncError,
  type BookingQuoteEnvelope,
  type BookingQuoteFunnel,
  type BookingQuoteResult,
  type BookingV2QuoteResult,
  type LegacyBookingQuoteResult,
} from "@/lib/booking/quote/bookingQuoteTypes";
export {
  buildBookingQuoteSignString,
  computeBookingQuoteSignature,
  signBookingQuoteCanonical,
  verifyBookingQuoteSignature,
  type BookingQuoteSignaturePayload,
} from "@/lib/booking/quote/bookingQuoteSignature";
export {
  durationHoursFromMinutes,
  durationMinuteLimitsFromHours,
  durationMinuteLimitsFromTariff,
  estimateUnifiedJobDurationHours,
  resolveBookingV2DurationWorkload,
  resolveLegacyJobDurationWorkload,
} from "@/lib/booking/quote/resolveBookingDurationWorkload";
export {
  buildAuthoritativeQuotePersistPatch,
  buildAuthoritativeQuoteDurationOnlyPatch,
  authoritativeDurationPatchFromBookingRow,
  buildLegacyLockDurationPersistPatch,
  estimatedFinishAtIso,
  resolvePersistedBookingDurationMinutes,
  resolveSchedulingDurationMinutes,
  type AuthoritativeQuotePersistInput,
  type BookingDurationRowLike,
} from "@/lib/booking/quote/bookingQuotePersistence";
export {
  healBookingDurationForScheduling,
  resolveHealedBookingDurationMinutes,
  type HealableBookingDurationRow,
} from "@/lib/booking/quote/healBookingDurationForScheduling";
export {
  assertBookingQuoteEnvelopeIntegrity,
  attachBookingQuoteEnvelopeToV2Breakdown,
  buildBookingQuoteEnvelope,
  resolveBookingV2Quote,
  resolveLegacyBookingQuote,
  resolveLegacyBookingQuoteFromParts,
  verifyBookingV2QuoteBreakdown,
  type ResolveLegacyBookingQuoteResult,
} from "@/lib/booking/quote/resolveBookingQuote";
export {
  assertV2ConfirmQuoteIntegrity,
  buildBookingV2QuoteSignatureInputs,
} from "@/lib/booking/quote/validateBookingV2Quote";
