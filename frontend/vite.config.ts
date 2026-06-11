import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // Listen on all local IP addresses
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/health': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/comfy': {
        target: 'http://127.0.0.1:8188',
        changeOrigin: true,
        ws: true,
        rewrite: (path) => path.replace(/^\/comfy/, ''),
      },
    },
  },
})
