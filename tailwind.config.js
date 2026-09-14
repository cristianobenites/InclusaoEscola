/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: { sans: ["Inter", "system-ui", "sans-serif"] },
      colors: {
        tinta: { DEFAULT: "#1f2a37", suave: "#4b5563", fraca: "#6b7280" },
        papel: { DEFAULT: "#f7f6f2", card: "#ffffff", borda: "#e5e2da" },
        marca: { DEFAULT: "#0f766e", forte: "#115e59", suave: "#ccfbf1", fundo: "#f0fdfa" },
        sol: { DEFAULT: "#d97706", suave: "#fef3c7" },
        erro: { DEFAULT: "#b91c1c", suave: "#fee2e2" },
      },
      boxShadow: { card: "0 1px 2px rgba(31,42,55,.06), 0 4px 16px rgba(31,42,55,.06)" },
      borderRadius: { xl2: "1.25rem" },
    },
  },
  plugins: [],
};
