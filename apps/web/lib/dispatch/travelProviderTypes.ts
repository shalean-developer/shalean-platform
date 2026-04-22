export type LatLng = { lat: number; lng: number };

export interface TravelTimeProvider {
  getTravelTimeMinutes(params: { origin: LatLng; destination: LatLng }): Promise<number>;
}
