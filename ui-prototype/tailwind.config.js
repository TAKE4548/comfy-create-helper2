import path from 'node:path'
import { fileURLToPath } from 'node:url'
import frontendConfig from '../frontend/tailwind.config.js'

const dir = path.dirname(fileURLToPath(import.meta.url))

// Preserve the frontend theme, but scan frontend source from the prototype root.
export default {
  ...frontendConfig,
  content: [
    path.resolve(dir, 'index.html'),
    path.resolve(dir, 'src/**/*.{js,ts,jsx,tsx}'),
    path.resolve(dir, '../frontend/index.html'),
    path.resolve(dir, '../frontend/src/**/*.{js,ts,jsx,tsx}'),
  ],
}
