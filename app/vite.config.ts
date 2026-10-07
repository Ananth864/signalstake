import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // relative base so the built app works at any Pages path
  base: "./",
  server: { port: 5173 },
});
