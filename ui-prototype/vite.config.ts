import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  resolve: { dedupe: ['react', 'react-dom', 'react-router-dom'] },
  server: {
    host: '0.0.0.0',
    fs: { allow: [path.resolve(__dirname, '..')] },
    // No backend proxy: the baseline prototype must not contact production services.
  },
})
