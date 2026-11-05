import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react()],
  test: {
    // the sim tests loop over many seeded raids/years: several sit near the 5 s default and time out on a loaded CI runner
    // (they passed locally and on re-run). A generous default is not a skip: a hung test still fails, just later.
    testTimeout: 30_000,
  },
})
