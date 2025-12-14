import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [['babel-plugin-react-compiler']],
      },
    }),
  ],


  // FOR HTTPS WITH TAILSCALE HOSTNAMES
  server: {
    allowedHosts: [
      'desktop-mbp34on.tail599557.ts.net',
      '.ts.net', // Allow all Tailscale hosts
    ],
  },
})
