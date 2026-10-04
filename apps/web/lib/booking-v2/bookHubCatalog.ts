import type {
  BookingV2CatalogPayload,
  ServicesCatalog,
} from "@/lib/booking-v2/bookingV2CatalogTypes";

type BookHubCatalogLoader = () => Promise<Pick<BookingV2CatalogPayload, "catalog">>;

export async function loadBookHubCatalogSafely(
  loader: BookHubCatalogLoader,
  onError?: (error: unknown) => void,
): Promise<ServicesCatalog | null> {
  try {
    const { catalog } = await loader();
    return catalog;
  } catch (error) {
    onError?.(error);
    return null;
  }
}
