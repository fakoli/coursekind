/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const isolatedE2E = mode === 'e2e'
  return {
    plugins: [react()],
    // Browser acceptance must never inherit a user's API destination or .env.
    // Keep normal development environment behavior unchanged.
    ...(isolatedE2E ? {
      envDir: false as const,
      envPrefix: [],
      define: { 'import.meta.env.VITE_API_URL': JSON.stringify('/api/v1') },
    } : {}),
    server: {
      proxy: {
        '/api': isolatedE2E ? 'http://127.0.0.1:8018'
          : process.env.VITE_API_PROXY || 'http://localhost:8010',
      },
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: './src/test/setup.ts',
      css: false,
      exclude: ['e2e/**', 'node_modules/**'],
    },
  }
})
