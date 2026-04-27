import { getDistanceKm } from "@/lib/dispatch/routeOptimization";

export type BookingForCluster = {
  id: string;
  date: string;
  time: string;
  lat: number | null;
  lng: number | null;
  locationId?: string | null;
};

export type ClusteredBookingRow = BookingForCluster & { cluster_id: string };

function hmToMinutes(hm: string): number {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(hm).trim());
  if (!m) return NaN;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(mm)) return NaN;
  return h * 60 + mm;
}

function stableClusterId(seed: string, index: number): string {
  return `mi_cluster_${index.toString(36)}_${seed.slice(0, 8)}`;
}

/**
 * Greedy geo + time clustering (configurable radius km, default 7.5km).
 * Same cleaner-friendly batches for routing; each row gets `cluster_id`.
 */
export function clusterBookingsByLocation(
  bookings: BookingForCluster[],
  options?: { radiusKm?: number; timeWindowMinutes?: number; seed?: string },
): ClusteredBookingRow[] {
  const radiusKm = options?.radiusKm ?? 7.5;
  const timeWin = options?.timeWindowMinutes ?? 120;
  const seed = options?.seed ?? "default";

  const sorted = [...bookings].sort((a, b) => {
    const da = hmToMinutes(a.time);
    const db = hmToMinutes(b.time);
    if (Number.isFinite(da) && Number.isFinite(db) && da !== db) return da - db;
    return a.id.localeCompare(b.id);
  });

  const clusters: BookingForCluster[][] = [];
  for (const b of sorted) {
    const minutes = hmToMinutes(b.time);
    let placed = false;
    for (const cluster of clusters) {
      const anchor = cluster[0]!;
      const anchorMin = hmToMinutes(anchor.time);
      const sameWindow =
        Number.isFinite(minutes) && Number.isFinite(anchorMin) && Math.abs(minutes - anchorMin) <= timeWin;

      const hasCoords =
        anchor.lat != null &&
        anchor.lng != null &&
        b.lat != null &&
        b.lng != null &&
        Number.isFinite(anchor.lat) &&
        Number.isFinite(anchor.lng) &&
        Number.isFinite(b.lat) &&
        Number.isFinite(b.lng);

      const nearEnough = hasCoords
        ? getDistanceKm(
            { lat: anchor.lat as number, lng: anchor.lng as number },
            { lat: b.lat as number, lng: b.lng as number },
          ) <= radiusKm
        : Boolean(anchor.locationId && anchor.locationId === b.locationId);

      if (sameWindow && nearEnough) {
        cluster.push(b);
        placed = true;
        break;
      }
    }
    if (!placed) clusters.push([b]);
  }

  const out: ClusteredBookingRow[] = [];
  clusters.forEach((group, idx) => {
    const cid = stableClusterId(seed, idx);
    for (const row of group) out.push({ ...row, cluster_id: cid });
  });
  return out;
}
