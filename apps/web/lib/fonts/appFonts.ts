import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";

/**
 * Primary UI sans — bundled in `geist` via `next/font/local` (no Google Fonts network fetch at build).
 */
export const geistSans = GeistSans;

/**
 * Monospace for admin / portal consoles only — not on marketing HTML to avoid an extra font payload.
 * Import `geistMono.variable` in app-shell layouts (office, dashboard, admin, etc.).
 */
export const geistMono = GeistMono;
