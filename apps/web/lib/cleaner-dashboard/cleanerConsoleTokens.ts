/**
 * Shared constants for cleaner “work console” UI — use to avoid magic numbers drifting.
 * Prefer wiring through Tailwind arbitrary values where needed, e.g. `duration-[${motion.heroBlockMs}ms]`.
 */
export const cleanerConsole = {
  spacing: { s: 8, m: 12, l: 16, xl: 20 },
  radiusPx: { card: 16, heroShell: 16 },
  motion: {
    heroStaggerMs: 50,
    heroBlockMs: 160,
    ease: [0.22, 1, 0.36, 1] as const,
  },
} as const;
