import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import wasm from 'vite-plugin-wasm';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    wasm(),
  ],
  optimizeDeps: {
    exclude: ['@zama-fhe/relayer-sdk'],
  },
  build: {
    target: 'esnext',
    sourcemap: true,
  },
  server: {
    headers: {
      'Cross-Origin-Opener-Policy':   'same-origin-allow-popups',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  preview: {
    headers: {
      'Cross-Origin-Opener-Policy':   'same-origin-allow-popups',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
});