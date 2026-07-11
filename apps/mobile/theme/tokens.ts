/**
 * Shalean Cleaner design tokens — workforce platform.
 * Brand primary matches website `--primary: #2563eb` (apps/web/app/globals.css).
 * Semantic status greens/ambers/reds are separate from brand.
 */
export const colors = {
  brand: {
    50: "#eff6ff",
    100: "#dbeafe",
    200: "#bfdbfe",
    500: "#2563eb",
    600: "#1d4ed8",
    700: "#1e40af",
    900: "#0b1f4a",
  },
  /** Earnings / money accent — distinct from brand blue */
  earnings: {
    bg: "#ecfdf5",
    fg: "#047857",
    border: "#a7f3d0",
  },
  surface: {
    default: "#f4f6f5",
    card: "#ffffff",
    muted: "#e8ece9",
    elevated: "#ffffff",
  },
  ink: {
    default: "#14201b",
    muted: "#5b6b63",
    subtle: "#8a9a91",
    inverse: "#ffffff",
  },
  border: {
    default: "#e8ece9",
    strong: "#d0d7d2",
  },
  status: {
    success: { bg: "#e8f5ef", fg: "#166534" },
    warning: { bg: "#fff4e5", fg: "#9a6700" },
    danger: { bg: "#fdecec", fg: "#b42318" },
    info: { bg: "#e8f1fb", fg: "#175cd3" },
    neutral: { bg: "#eef1ef", fg: "#5b6b63" },
  },
  danger: {
    border: "#f5c2c0",
    text: "#b42318",
  },
  overlay: "rgba(20, 32, 27, 0.45)",
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  "2xl": 32,
  "3xl": 48,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  "2xl": 24,
  full: 9999,
} as const;

export const typography = {
  /** Hero / screen title */
  display: { size: 28, lineHeight: 34, weight: "700" as const },
  title: { size: 22, lineHeight: 28, weight: "700" as const },
  heading: { size: 18, lineHeight: 24, weight: "600" as const },
  body: { size: 16, lineHeight: 22, weight: "400" as const },
  bodyEmphasis: { size: 16, lineHeight: 22, weight: "600" as const },
  caption: { size: 13, lineHeight: 18, weight: "400" as const },
  label: { size: 12, lineHeight: 16, weight: "600" as const },
  overline: { size: 11, lineHeight: 14, weight: "600" as const },
} as const;

/** Elevation — subtle, not multi-layer glow */
export const shadows = {
  none: {
    shadowColor: "transparent",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  sm: {
    shadowColor: "#14201b",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  md: {
    shadowColor: "#14201b",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  lg: {
    shadowColor: "#14201b",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 6,
  },
} as const;

/** Minimum touch target (pt) — WCAG / Apple HIG */
export const touchTarget = 48;

export const iconSize = {
  sm: 16,
  md: 20,
  lg: 24,
  xl: 28,
} as const;
