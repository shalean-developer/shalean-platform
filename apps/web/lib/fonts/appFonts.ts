import { Geist, Geist_Mono } from "next/font/google";

/** Primary UI sans — loaded on every route via root layout. */
export const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

/**
 * Monospace for admin / portal consoles only — not on marketing HTML to avoid an extra font payload.
 * Import `geistMono.variable` in app-shell layouts (office, dashboard, admin, etc.).
 */
export const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  preload: false,
});
