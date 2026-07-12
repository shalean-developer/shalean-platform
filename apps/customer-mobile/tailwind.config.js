/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
    "./features/**/*.{js,jsx,ts,tsx}",
    "./providers/**/*.{js,jsx,ts,tsx}",
    "../../packages/mobile-ui/src/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eff6ff",
          100: "#dbeafe",
          200: "#bfdbfe",
          500: "#2563eb",
          600: "#1d4ed8",
          700: "#1e40af",
          900: "#0b1f4a",
        },
        credit: {
          bg: "#ecfdf5",
          fg: "#047857",
          border: "#a7f3d0",
        },
        surface: {
          DEFAULT: "#f4f6f8",
          card: "#ffffff",
          muted: "#e8ecf1",
          elevated: "#ffffff",
        },
        ink: {
          DEFAULT: "#14201b",
          muted: "#5b6b63",
          subtle: "#8a9a91",
          inverse: "#ffffff",
        },
        border: {
          DEFAULT: "#e8ece9",
          strong: "#d0d7d2",
        },
        danger: {
          border: "#f5c2c0",
          DEFAULT: "#b42318",
        },
        status: {
          success: { bg: "#e8f5ef", fg: "#166534" },
          warning: { bg: "#fff4e5", fg: "#9a6700" },
          danger: { bg: "#fdecec", fg: "#b42318" },
          info: { bg: "#e8f1fb", fg: "#175cd3" },
          neutral: { bg: "#eef1ef", fg: "#5b6b63" },
        },
      },
      spacing: {
        "4.5": "1.125rem",
        18: "4.5rem",
      },
      borderRadius: {
        sm: "8px",
        md: "12px",
        lg: "16px",
        xl: "20px",
        "2xl": "24px",
      },
      fontSize: {
        /** App title / hero heading */
        display: ["28px", { lineHeight: "36px", fontWeight: "700" }],
        /** Screen titles */
        title: ["24px", { lineHeight: "32px", fontWeight: "600" }],
        /** Section headings */
        heading: ["20px", { lineHeight: "28px", fontWeight: "600" }],
        /** Card titles */
        card: ["18px", { lineHeight: "24px", fontWeight: "600" }],
        /** Body text */
        body: ["16px", { lineHeight: "24px", fontWeight: "400" }],
        /** Secondary / descriptions */
        caption: ["14px", { lineHeight: "20px", fontWeight: "400" }],
        /** Small labels (minimum size) */
        label: ["12px", { lineHeight: "16px", fontWeight: "500" }],
        /** Button labels */
        button: ["16px", { lineHeight: "24px", fontWeight: "600" }],
        /** Navigation tabs */
        tab: ["12px", { lineHeight: "16px", fontWeight: "500" }],
        /** @deprecated Prefer `label` — kept ≥12px for a11y */
        overline: ["12px", { lineHeight: "16px", fontWeight: "500" }],
      },
      fontFamily: {
        sans: ["System"],
        mono: ["SpaceMono"],
      },
      minHeight: {
        touch: "48px",
      },
      minWidth: {
        touch: "48px",
      },
    },
  },
  plugins: [],
};
