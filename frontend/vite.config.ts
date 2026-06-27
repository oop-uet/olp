import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/olp/',
  build: {
    // Raise warning limit slightly; Monaco is large but lazy-loaded
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks: {
          // Split heavy/independent vendor libraries into their own chunks
          // so the initial app shell loads fast.
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'monaco': ['@monaco-editor/react'],
        },
      },
    },
  },
})
