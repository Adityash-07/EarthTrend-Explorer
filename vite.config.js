import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Vite configuration file.
// - "plugins: [react()]" enables JSX (React syntax like <MyComponent />) to work.
// - The public/ folder is served as-is, so public/data/GLB.Ts+dSST.csv
//   will be accessible at /data/GLB.Ts+dSST.csv in the browser.
// - chunkSizeWarningLimit is raised because Recharts is a large library;
//   this is expected and does not affect performance for a dashboard app.
export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 700,
  },
})
