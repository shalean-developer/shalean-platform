export type CleanerRow = {
  id: string;
  full_name: string;
  rating: number;
  jobs_completed: number;
  status: string;
  city_id?: string | null;
  location_id?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  home_lat?: number | null;
  home_lng?: number | null;
  acceptance_rate?: number | null;
  acceptance_rate_recent?: number | null;
  total_offers?: number | null;
  accepted_offers?: number | null;
  avg_response_time_ms?: number | null;
  last_response_at?: string | null;
  tier?: string | null;
  priority_score?: number | null;
  marketplace_outcome_ema?: number | null;
};

export type SmartDispatchCandidate = CleanerRow & {
  score: number;
  distance_km: number;
};

export type AvailabilityRow = {
  cleaner_id: string;
  date: string;
  start_time: string;
  end_time: string;
  is_available: boolean;
};
