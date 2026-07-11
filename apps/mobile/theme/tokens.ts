/**
 * Shalean Cleaner design tokens.
 * Brand primary matches website `--primary: #2563eb` (apps/web/app/globals.css).
 * Semantic status greens/ambers/reds are separate from brand.
 */
export const colors = {
  brand: {
    50: "#eff6ff",
    100: "#dbeafe",
    500: "#2563eb",
    600: "#1d4ed8",
    700: "#1e40af",
    900: "#0b1f4a",
  },
  surface: {
    default: "#f7f8f7",
    card: "#ffffff",
    muted: "#eef1ef",
  },
  ink: {
    default: "#14201b",
    muted: "#5b6b63",
    inverse: "#ffffff",
  },
  status: {
    /** Semantic success — keep green (not brand). */
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
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  "2xl": 48,
} as const;

export const typography = {
  title: 28,
  heading: 22,
  body: 16,
  caption: 13,
} as const;
