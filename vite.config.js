import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      devOptions: {
        enabled: true
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,json}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
      manifest: {
        name: 'Softly Built POS',
        short_name: 'SoftlyBuilt',
        description: 'Softly Built POS & Inventory Management System',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        display: 'standalone'
      }
    })
  ],
  server: {
    port: 5173,
    open: true,
    proxy: {
      '/api': {
        target: 'https://softlybuilt.vercel.app',
        changeOrigin: true,
        secure: false,
      }
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
