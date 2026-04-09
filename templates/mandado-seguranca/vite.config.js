import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    outDir: 'public',
    rollupOptions: {
      input: 'src/main.js',
      output: {
        entryFileNames: 'app.js',
        chunkFileNames: 'chunks/[name].js',
        assetFileNames: 'assets/[name][extname]',
      }
    }
  },
  server: {
    port: 3456,
    open: true
  }
})
