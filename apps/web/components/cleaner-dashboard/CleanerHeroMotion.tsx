"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cleanerConsole } from "@/lib/cleaner-dashboard/cleanerConsoleTokens";

const ease = cleanerConsole.motion.ease;
const staggerS = cleanerConsole.motion.heroStaggerMs / 1000;
const blockS = cleanerConsole.motion.heroBlockMs / 1000;

/** Unified enter motion for hero control center (120–180ms). */
export function CleanerHeroMotion({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      animate="show"
      variants={{
        hidden: {},
        show: {
          transition: { staggerChildren: staggerS, delayChildren: 0.02 },
        },
      }}
    >
      {children}
    </motion.div>
  );
}

export function CleanerHeroBlock({ children, className }: { children: ReactNode; className?: string }) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      className={className}
      variants={{
        hidden: { opacity: reduceMotion ? 1 : 0, y: reduceMotion ? 0 : 10 },
        show: { opacity: 1, y: 0, transition: { duration: blockS, ease } },
      }}
    >
      {children}
    </motion.div>
  );
}
