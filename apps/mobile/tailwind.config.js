/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
    "./features/**/*.{js,jsx,ts,tsx}",
    "./providers/**/*.{js,jsx,ts,tsx}",
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
        earnings: {
          bg: "#ecfdf5",
          fg: "#047857",
          border: "#a7f3d0",
        },
        surface: {
          DEFAULT: "#f4f6f5",
          card: "#ffffff",
          muted: "#e8ece9",
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
        display: ["28px", { lineHeight: "34px", fontWeight: "700" }],
        title: ["22px", { lineHeight: "28px", fontWeight: "700" }],
        heading: ["18px", { lineHeight: "24px", fontWeight: "600" }],
        body: ["16px", { lineHeight: "22px" }],
        caption: ["13px", { lineHeight: "18px" }],
        label: ["12px", { lineHeight: "16px", fontWeight: "600" }],
        overline: ["11px", { lineHeight: "14px", fontWeight: "600" }],
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
