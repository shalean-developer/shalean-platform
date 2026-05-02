/**
 * Parse booking `date` + `time` as an instant in Africa/Johannesburg (fixed +02:00, no DST).
 * Used for “starts in …” countdowns on the cleaner dashboard.
 */
export function jobStartMsJohannesburg(dateYmd: string | null | undefined, timeRaw: string | null | undefined): number | null {
  const d0 = String(dateYmd ?? "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d0)) return null;
  let t = String(timeRaw ?? "").trim();
  if (!t) t = "09:00";
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(t);
  if (!m) return null;
  const hh = String(Number(m[1])).padStart(2, "0");
  const mm = String(Number(m[2])).padStart(2, "0");
  const ss = m[3] != null ? String(Number(m[3])).padStart(2, "0") : "00";
  const isoLocal = `${d0}T${hh}:${mm}:${ss}+02:00`;
  const ms = new Date(isoLocal).getTime();
  return Number.isFinite(ms) ? ms : null;
}
