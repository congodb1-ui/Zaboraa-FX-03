import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  const isPreview = process.env.AI_STUDIO_PREVIEW === 'true';

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      allowedHosts: true as const,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : { ignored: ['**/*.sqlite', '**/*.sqlite-*', '**/*.db', '**/*.db-*', '**/data/*.sqlite', '**/data/*.db'] },
      
      // --- ADDED PROXY CONFIGURATION ---
      // This routes API endpoints seamlessly from Vite to your Express backend
      proxy: {
        '/candles': {
          target: 'http://localhost:3000',
          changeOrigin: true,
        },
        '/audit': {
          target: 'http://localhost:3000',
          changeOrigin: true,
        },
        '/account': {
          target: 'http://localhost:3000',
          changeOrigin: true,
        },
        '/orders': {
          target: 'http://localhost:3000',
          changeOrigin: true,
        },
        '/health': {
          target: 'http://localhost:3000',
          changeOrigin: true,
        },
      },
    },
  };
});