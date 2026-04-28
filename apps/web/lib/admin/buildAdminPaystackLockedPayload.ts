import type { BookingServiceGroupKey, BookingServiceId, BookingServiceTypeKey } from "@/components/booking/serviceCategories";
import { inferServiceGroupFromServiceId, inferServiceTypeFromServiceId } from "@/components/booking/serviceCategories";

export function buildAdminPaystackLockedPayload(params: {
  serviceId: BookingServiceId;
  dateYmd: string;
  timeHm: string;
  location: string;
  finalPriceZar: number;
}): Record<string, unknown> {
  const finalPrice = Math.max(1, Math.round(params.finalPriceZar));
  const svc = params.serviceId;
  const service_type = inferServiceTypeFromServiceId(svc);
  const service_group = inferServiceGroupFromServiceId(svc);
  const selectedCategory: BookingServiceGroupKey | null = service_group;
  if (!service_type || !selectedCategory) {
    throw new Error("Invalid service for admin checkout lock.");
  }
  return {
    locked: true,
    lockedAt: new Date().toISOString(),
    date: params.dateYmd,
    time: params.timeHm,
    finalPrice,
    finalHours: 3,
    surge: 1,
    rooms: 2,
    bathrooms: 1,
    extraRooms: 0,
    extras: [],
    location: params.location.trim().slice(0, 500),
    propertyType: "apartment",
    cleaningFrequency: "one_time",
    service_group: selectedCategory,
    service_type,
    selectedCategory,
    service: svc,
  };
}
