import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
// [P11] preview.host: true allows `vite preview` to bind to 0.0.0.0 inside Docker.
// Without this, the server only listens on 127.0.0.1 and is unreachable
// from outside the container even with the port mapping in docker-compose.yml.
export default defineConfig({
  plugins: [react()],

  // Development server config (npm run dev / local)
  server: {
    host: true,    // bind to 0.0.0.0 — needed if running `npm run dev` inside Docker
    port: 5173,
  },

  // Preview server config (npm run preview — used in the Docker container)
  preview: {
    host: true,   // bind to 0.0.0.0 so Docker port mapping works
    port: 5173,
  },
})
