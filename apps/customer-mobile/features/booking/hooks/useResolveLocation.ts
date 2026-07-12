import { useEffect, useState } from "react";
import { getBookingV2Api } from "@/services/customerApi";
import type { ResolveLocationResponse } from "@/services/types/bookingV2";

export function useResolveLocation(suburb: string) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locationId, setLocationId] = useState("");
  const [cityId, setCityId] = useState("");

  useEffect(() => {
    const trimmed = suburb.trim();
    if (trimmed.length < 2) {
      setLocationId("");
      setCityId("");
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        setLoading(true);
        setError(null);
        const result = await getBookingV2Api().resolveLocation<ResolveLocationResponse>({
          suburb: trimmed,
        });
        if (cancelled) return;
        if (!result.ok || !result.data.ok || !result.data.locationId) {
          setLocationId("");
          setCityId("");
          setError(
            result.ok
              ? result.data.error || "We could not match that suburb to a service area."
              : result.error || "Could not resolve suburb.",
          );
          setLoading(false);
          return;
        }
        setLocationId(result.data.locationId);
        setCityId(result.data.cityId ?? "");
        setError(null);
        setLoading(false);
      })();
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [suburb]);

  return { loading, error, locationId, cityId };
}
