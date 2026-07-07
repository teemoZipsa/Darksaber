import { defineConfig, devices } from '@playwright/test';
import { rmSync } from 'node:fs';

const reuseExistingServer = !process.env.CI;
const playwrightRuntimeFiles = [
    'server/.runtime/playwright-world-save-spool.json',
    'server/.runtime/playwright-world-save-spool.json.bak',
    'server/.runtime/playwright-world-session-snapshots.json',
    'server/.runtime/playwright-world-session-snapshots.json.bak',
];
for (const file of playwrightRuntimeFiles) rmSync(file, { force: true });

export default defineConfig({
    testDir: './tests/e2e',
    timeout: 30_000,
    expect: {
        timeout: 10_000,
    },
    fullyParallel: false,
    workers: 1,
    reporter: process.env.CI ? 'github' : 'list',
    use: {
        baseURL: 'http://127.0.0.1:5731',
        trace: 'on-first-retry',
    },
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
        {
            name: 'mobile-chrome',
            use: { ...devices['Pixel 7'] },
        },
    ],
    webServer: [
        {
            command: 'npm run server',
            url: 'http://127.0.0.1:8765/healthz',
            reuseExistingServer,
            timeout: 30_000,
            env: {
                NODE_ENV: 'development',
                WORLD_SAVE_SPOOL_PATH: 'server/.runtime/playwright-world-save-spool.json',
                WORLD_SESSION_SNAPSHOT_PATH: 'server/.runtime/playwright-world-session-snapshots.json',
            },
        },
        {
            command: 'npx vite --host 127.0.0.1 --port 5731 --strictPort',
            url: 'http://127.0.0.1:5731',
            reuseExistingServer,
            timeout: 60_000,
            env: {
                PLAYWRIGHT: '1',
            },
        },
    ],
});
