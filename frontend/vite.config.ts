import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
// Local backend by default; BACKEND_URL overrides for remote/staging runs.
// Without the fallback, a plain `npm run dev` proxied /api to `undefined`
// and every UI call died with a 502.
const target_url = process.env.BACKEND_URL || 'http://localhost:4000';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      port: 3000,
      // Forward API calls to the Express backend.
      proxy: {
        '/api': {
          target: target_url,
          changeOrigin: true,
        },
      },
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
