import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  plugins: [react()],
  base: "./",
  root: path.resolve(__dirname, "src/dashboard"),
  build: {
    outDir: path.resolve(__dirname, "dist/dashboard"),
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@dashboard": path.resolve(__dirname, "./src/dashboard"),
      "@server": path.resolve(__dirname, "./src/server"),
      "@utils": path.resolve(__dirname, "./src/utils"),
      "@types": path.resolve(__dirname, "./src/types"),
    },
  },
  server: {
    proxy: {
      "/api": {
        target: `http://localhost:${process.env.ARTIFACT_API_PORT || 7000}`,
        changeOrigin: true,
      },
      "/p": {
        target: `http://localhost:${process.env.ARTIFACT_API_PORT || 7000}`,
        changeOrigin: true,
      },
    },
  },
});
