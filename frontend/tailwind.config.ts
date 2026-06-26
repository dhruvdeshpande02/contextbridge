import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "#08090c",
        surface:    "#0f1117",
        elevated:   "#161b27",
        border:     "rgba(255,255,255,0.07)",
        accent:     { DEFAULT: "#4f7ef8", hover: "#3b6ef0" },
        ink:        "#e8eaf0",
        muted:      "#5a6070",
        subtle:     "#8891a4",
        faint:      "#111520",
      },
      fontFamily: { sans: ["Inter", "system-ui", "sans-serif"] },
      keyframes: {
        "slide-up": {
          "0%":   { transform: "translateY(10px)", opacity: "0" },
          "100%": { transform: "translateY(0)",    opacity: "1" },
        },
        "scale-in": {
          "0%":   { transform: "scale(0.97)", opacity: "0" },
          "100%": { transform: "scale(1)",    opacity: "1" },
        },
        "shimmer": {
          "0%":   { "background-position": "-200% center" },
          "100%": { "background-position": "200% center"  },
        },
        "pulse-glow": {
          "0%, 100%": { opacity: "0.5" },
          "50%":      { opacity: "1"   },
        },
        "float": {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%":      { transform: "translateY(-8px)" },
        },
        "spin-slow": {
          "0%":   { transform: "rotate(0deg)"   },
          "100%": { transform: "rotate(360deg)" },
        },
        "thought-rise": {
          "0%":   { transform: "translateY(0) scale(1)",    opacity: "0.6" },
          "100%": { transform: "translateY(-40px) scale(1)", opacity: "0"  },
        },
      },
      animation: {
        "slide-up":   "slide-up 0.35s ease-out both",
        "scale-in":   "scale-in 0.25s ease-out both",
        "shimmer":    "shimmer 1.6s linear infinite",
        "pulse-glow": "pulse-glow 2s ease-in-out infinite",
        "float":      "float 4s ease-in-out infinite",
        "spin-slow":  "spin-slow 6s linear infinite",
        "thought-rise": "thought-rise 2s ease-out infinite",
        "float-delay": "float 5s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
export default config;
