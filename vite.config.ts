/// <reference types="vitest/config" />
import { defineConfig } from 'vite'

export default defineConfig({
  // Served from https://<user>.github.io/freaky-sheets/
  base: '/freaky-sheets/',
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
  },
})
