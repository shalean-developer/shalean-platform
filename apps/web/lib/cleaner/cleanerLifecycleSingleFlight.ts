/** Serialize async work (e.g. lifecycle flush) so concurrent callers coalesce to one run. */

export function createSingleFlight(): {
  run: <T>(fn: () => Promise<T>) => Promise<T | undefined>;
} {
  let inFlight = false;
  return {
    async run<T>(fn: () => Promise<T>): Promise<T | undefined> {
      if (inFlight) return undefined;
      inFlight = true;
      try {
        return await fn();
      } finally {
        inFlight = false;
      }
    },
  };
}
