/**
 * Hook for outbound offer alerts (WhatsApp / push). No-op stub until wired.
 */
export async function notifyCleanerOfDispatchOffer(_params: {
  bookingId: string;
  offerId: string;
  cleanerId: string;
  expiresAtIso: string;
}): Promise<void> {
  void _params;
}
