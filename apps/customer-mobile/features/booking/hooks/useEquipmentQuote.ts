import { useEffect, useState } from "react";
import { getBookingV2Api } from "@/services/customerApi";
import type { EquipmentQuoteResult } from "@/services/types/bookingV2";

type Args = {
  enabled: boolean;
  equipmentRequired: "yes" | "no" | "";
  address: string;
  suburb: string;
  city: string;
  postalCode: string;
};

export function useEquipmentQuote(args: Args) {
  const { enabled, equipmentRequired, address, suburb, city, postalCode } = args;
  const [quote, setQuote] = useState<EquipmentQuoteResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canQuote = address.trim().length >= 5 && suburb.trim().length >= 2;

  useEffect(() => {
    if (!enabled || equipmentRequired !== "yes") {
      setQuote(null);
      setError(null);
      setLoading(false);
      return;
    }
    if (!canQuote) {
      setQuote(null);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        setLoading(true);
        setError(null);
        const result = await getBookingV2Api().equipmentQuote<{
          quote?: EquipmentQuoteResult | null;
          error?: string;
        }>({
          address: address.trim(),
          suburb: suburb.trim(),
          city: city.trim() || "Cape Town",
          postalCode: postalCode.trim(),
          equipmentRequired: true,
        });
        if (cancelled) return;
        if (!result.ok) {
          setQuote(null);
          setError(result.error || "Could not calculate equipment fee.");
          setLoading(false);
          return;
        }
        if (result.data.error) {
          setQuote(null);
          setError(result.data.error);
          setLoading(false);
          return;
        }
        setQuote(result.data.quote ?? null);
        setLoading(false);
      })();
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [enabled, equipmentRequired, address, suburb, city, postalCode, canQuote]);

  return { quote, loading, error, canQuote };
}
