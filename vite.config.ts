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
        chunkSizeWarningLimit: 650,
        rolldownOptions: {
            output: {
                codeSplitting: {
                    maxSize: 450 * 1024,
                    groups: [
                        {
                            name: 'vendor-react',
                            test: /[\\/]node_modules[\\/](react|react-dom)[\\/]/,
                            priority: 4,
                        },
                        {
                            name: 'game-story-data',
                            test: /[\\/]src[\\/]data[\\/](StoryScenario|StoryInterior|OriginalLateStory)/,
                            maxSize: 450 * 1024,
                            priority: 3,
                        },
                        {
                            name: 'game-item-data',
                            test: /[\\/]src[\\/]data[\\/](ItemDB|ShopData|OriginalShopItems|Market|Facility|Rest)/,
                            maxSize: 450 * 1024,
                            priority: 3,
                        },
                        {
                            name: 'game-map-data',
                            test: /[\\/]src[\\/]map[\\/]/,
                            maxSize: 450 * 1024,
                            priority: 3,
                        },
                        {
                            name: 'game-data',
                            test: /[\\/]src[\\/](data|map)[\\/]/,
                            maxSize: 450 * 1024,
                            priority: 2,
                        },
                        {
                            name: 'game-engine',
                            test: /[\\/]src[\\/](engine|field|raid|combat)[\\/]/,
                            maxSize: 450 * 1024,
                            priority: 1,
                        },
                        {
                            name: 'ui-overlay',
                            test: /[\\/]src[\\/]ui[\\/]react[\\/]/,
                            priority: 1,
                        },
                    ],
                },
            },
        },
    }
});
