import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        sampleGame: resolve(__dirname, "sample-game/index.html"),
      },
    },
  },
  server: {
    port: 5175,
    proxy: {
      "/api": "http://localhost:3001",
      "/auth": "http://localhost:3001",
      "/socket.io": {
        target: "ws://localhost:3001",
        ws: true
      }
    }
  }
});
