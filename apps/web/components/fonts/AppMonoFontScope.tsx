import { geistMono } from "@/lib/fonts/appFonts";

/** Applies Geist Mono CSS variable for portal / admin routes (not marketing). */
export function AppMonoFontScope({ children }: { children: React.ReactNode }) {
  return <div className={geistMono.variable}>{children}</div>;
}
