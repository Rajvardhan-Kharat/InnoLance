import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:5003', changeOrigin: true },
      // Kept for dev setups that still use same-origin socket.io via 5173.
      '/socket.io': { target: 'http://localhost:5003', changeOrigin: true, ws: true },
    },
  },
});
