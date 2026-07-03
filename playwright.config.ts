import { defineConfig, devices } from '@playwright/test';

const reuseExistingServer = !process.env.CI;

export default defineConfig({
    testDir: './tests/e2e',
    timeout: 30_000,
    expect: {
        timeout: 10_000,
    },
    fullyParallel: false,
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
    ],
    webServer: [
        {
            command: 'npm run server',
            url: 'http://127.0.0.1:8765/healthz',
            reuseExistingServer,
            timeout: 30_000,
            env: {
                NODE_ENV: 'development',
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
