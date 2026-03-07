import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        wanged: {
          red: "#dc2626",
          green: "#16a34a",
          gold: "#eab308",
        },
      },
    },
  },
  plugins: [],
};

export default config;
