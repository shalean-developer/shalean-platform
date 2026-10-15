// The forward generation never rekeys or deletes the earlier governed fixtures.
export const FORWARD_SEED_TAG = 'DEVSEED-OCT2026';
export function forwardSeedFixtureId(id) {
  if (!/^f[2-8]000001-/.test(id)) throw new Error('Not a governed legacy financial fixture ID');
  return id.replace(/^f([2-8])000001-/,(_,kind)=>`f${kind}000002-`);
}
export function isForwardSeedBooking(row) {
  const date=row.date;
  return typeof date==='string' && /^\d{4}-\d{2}-\d{2}$/.test(date) && date>='2026-10-01'
    && Number.isFinite(Date.parse(date+'T12:00:00Z')) && new Date(date+'T12:00:00Z').toISOString().slice(0,10)===date;
}
