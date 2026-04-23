/**
 * Cheap counters for log drains (Datadog / Vercel / etc.). Extend with StatsD when needed.
 * Skipped in Vitest (`NODE_ENV === "test"`) to keep CI signal clean.
 */
export const metrics = {
  increment(name: string, fields?: Record<string, unknown>): void {
    if (process.env.NODE_ENV === "test") return;
    try {
      console.info("[metric]", JSON.stringify({ name, ts: new Date().toISOString(), ...fields }));
    } catch {
      /* ignore */
    }
  },
};
