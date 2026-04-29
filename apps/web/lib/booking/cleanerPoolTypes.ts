export type CleanerReviewSnippet = {
  rating: number;
  quote: string;
};

export type AvailableCleaner = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  rating: number;
  is_available: boolean;
  jobs_completed: number;
  review_count: number;
  recent_reviews: CleanerReviewSnippet[];
  distance_km: number | null;
  base_lat: number | null;
  base_lng: number | null;
};

/** Matches `cleaner_availability` — date-based only (no day_of_week). */
export type CleanerAvailabilityRow = {
  cleaner_id: string;
  start_time: string | null;
  end_time: string | null;
  date: string | null;
  is_available: boolean | null;
};
