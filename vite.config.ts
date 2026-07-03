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
        open: process.env.PLAYWRIGHT === '1' ? false : true
    },
    build: {
        outDir: 'dist',
        sourcemap: process.env.VITE_BUILD_SOURCEMAP === '1',
    }
});
