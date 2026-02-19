import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      keyframes: {
        slideInRight: {
          from: { opacity: '0', transform: 'translateX(110%)' },
          to:   { opacity: '1', transform: 'translateX(0)' },
        },
      },
      animation: {
        slideInRight: 'slideInRight 0.25s ease-out',
      },
    }
  },
  plugins: []
} satisfies Config;
