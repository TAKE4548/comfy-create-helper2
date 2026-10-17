import path from 'node:path'
import { fileURLToPath } from 'node:url'
import tailwindcss from 'tailwindcss'
import autoprefixer from 'autoprefixer'

const projectRoot = path.dirname(fileURLToPath(import.meta.url))
export default {
  plugins: [
    tailwindcss({
      config: path.resolve(projectRoot, '../frontend/tailwind.config.js'),
      content: [
        path.resolve(projectRoot, '../frontend/index.html'),
        path.resolve(projectRoot, '../frontend/src/**/*.{js,ts,jsx,tsx}'),
        path.resolve(projectRoot, './src/**/*.{js,ts,jsx,tsx}'),
      ],
    }),
    autoprefixer(),
  ],
}
