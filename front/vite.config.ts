import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    host: '0.0.0.0',
    open: false,
    proxy: {
      '/api': {
        target: 'http://gateway-service:3000',
        changeOrigin: true,
        ws: true
      },
      '/user': {
        target: 'http://gateway-service:3000',
        changeOrigin: true,
        ws: true
      },
      '/hero': {
        target: 'http://gateway-service:3000',
        changeOrigin: true,
        ws: true
      },
      '/inventory': {
        target: 'http://gateway-service:3000',
        changeOrigin: true,
        ws: true
      },
      '/dungeon': {
        target: 'http://gateway-service:3000',
        changeOrigin: true,
        ws: true
      },
      '/log': {
        target: 'http://gateway-service:3000',
        changeOrigin: true,
        ws: true
      }
    },
    cors: {
      origin: '*',
      credentials: true
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    minify: 'terser'
  }
})
