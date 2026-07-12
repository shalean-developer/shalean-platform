/** Response from `GET /api/customer/bookings/[id]/track`. */

export type CustomerTrackPoint = {
  lat: number;
  lng: number;
  created_at: string | null;
};

export type CustomerBookingTrackDto = {
  bookingId: string;
  locationLabel: string | null;
  service: string | null;
  cleanerName: string | null;
  phase: string;
  trackable: boolean;
  point: CustomerTrackPoint | null;
  message: string;
};

export type CustomerBookingTrackResponse = {
  track?: CustomerBookingTrackDto;
  error?: string;
};
