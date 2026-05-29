import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
    root: '.',
    publicDir: 'public',
    plugins: [react()],
    server: {
        host: '127.0.0.1',
        port: 5731,
        strictPort: true,
        open: true
    },
    build: {
        outDir: 'dist',
        sourcemap: true
    }
});
