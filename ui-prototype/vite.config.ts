import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const backend = env.PROTOTYPE_BACKEND_URL || 'http://127.0.0.1:8000'
  return {
    plugins: [react()],
    resolve: {
      dedupe: ['react', 'react-dom', 'react-router-dom'],
    },
    server: {
      fs: { allow: [path.resolve(__dirname, '..')] },
      proxy: {
        '/api': { target: backend, changeOrigin: false, ws: true },
        '/health': { target: backend, changeOrigin: true },
      },
    },
  }
})
