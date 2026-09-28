import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Base path for GitHub Pages project site (github.io/zreq/).
// Override with VITE_BASE env var when using a custom domain.
const base = process.env.VITE_BASE ?? '/zreq/'

export default defineConfig({
  plugins: [react()],
  base,
})
