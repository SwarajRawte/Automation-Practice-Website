import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const backendPort = process.env.PORT || env.PORT || "3100";
  const apiTarget =
    process.env.VITE_API_TARGET ||
    env.VITE_API_TARGET ||
    `http://localhost:${backendPort}`;

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        "/api": { target: apiTarget },
        "/socket.io": { target: apiTarget, ws: true },
      },
    },
    build: { outDir: "dist" },
  };
});
