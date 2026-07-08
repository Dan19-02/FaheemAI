import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import {defineConfig} from 'vite';
// Default to the local Fahim backend so `npm run dev` proxies /api without extra env.
const target_url = process.env.BACKEND_URL || 'http://localhost:4000';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: 3000,
      // Forward API + live-voice WebSocket calls to the Express backend.
      proxy: {
        '/api': {
          target: target_url,
          changeOrigin: true,
          ws: true,
        },
      },
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
