/** @type {import('tailwindcss').Config} */
// Identidade visual do Instituto Inclusão na Escola (inclusaonaescola.com.br):
// fonte Ubuntu, azul-marinho para texto, azul para ação, e as cores do logo
// (verde, amarelo) mais tons pastel para blocos.
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: { sans: ["Ubuntu", "system-ui", "sans-serif"] },
      colors: {
        tinta: { DEFAULT: "#233a55", suave: "#5a6b80", fraca: "#8494a8" },
        papel: { DEFAULT: "#f6f8fc", card: "#ffffff", borda: "#dfe4ec" },
        marca: { DEFAULT: "#125dda", forte: "#0e4bb0", suave: "#d5e5ff", fundo: "#eef4ff" },
        verde: { DEFAULT: "#47c249", suave: "#d0f7d9" },
        sol: { DEFAULT: "#c98f00", vivo: "#ffc803", suave: "#ffe26c", fundo: "#fff6cc" },
        rosa: { DEFAULT: "#d63a5a", suave: "#ffd8d9" },
        erro: { DEFAULT: "#b91c1c", suave: "#fee2e2" },
      },
      boxShadow: { card: "0 1px 2px rgba(35,58,85,.05), 0 6px 20px rgba(35,58,85,.06)" },
    },
  },
  plugins: [],
};
