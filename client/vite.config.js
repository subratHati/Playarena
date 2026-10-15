import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // The game rules live in ../shared so the server and the vs-computer mode use the same code.
  server: { port: 5173, fs: { allow: ['..'] } },
});
