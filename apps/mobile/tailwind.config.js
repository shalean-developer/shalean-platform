/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}", "./features/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eff6ff",
          100: "#dbeafe",
          500: "#2563eb",
          600: "#1d4ed8",
          700: "#1e40af",
          900: "#0b1f4a",
        },
        surface: {
          DEFAULT: "#f7f8f7",
          card: "#ffffff",
          muted: "#eef1ef",
        },
        ink: {
          DEFAULT: "#14201b",
          muted: "#5b6b63",
          inverse: "#ffffff",
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
      fontFamily: {
        sans: ["System"],
        mono: ["SpaceMono"],
      },
    },
  },
  plugins: [],
};
