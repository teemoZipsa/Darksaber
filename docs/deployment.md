# Deployment

This project has two deployable pieces:

- Vite client: static files from `npm run build`
- World server: Node WebSocket service from `server/index.ts`

The public client must be built with a public WebSocket URL:

```bash
VITE_WORLD_SERVER_URL=wss://your-world-server.example.com npm run build
```

Use `wss://` for production HTTPS pages. Browsers usually block insecure
`ws://` connections from an HTTPS site.

If `VITE_WORLD_SERVER_URL` is omitted in a production build, the static client
still runs as a portfolio demo, but network raids and the shared market server
remain disabled until a WebSocket server URL is configured.

## Render WebSocket server

1. Push the repository to GitHub.
2. In Render, create a Blueprint from this repository, or create a Web Service manually.
3. Use these settings if creating it manually:
   - Build command: `npm ci`
   - Start command: `npm run server`
   - Health check path: `/healthz`
4. After deploy, copy the public service URL and use it as:

```text
VITE_WORLD_SERVER_URL=wss://<render-service-host>
```

The server reads `process.env.PORT`, which Render sets automatically. Locally it
falls back to port `8765`.

Auto-deploy is intentionally disabled for the Render server to preserve free-tier
build/runtime quota. Deploy the server manually only when backend/server code
changes need to go live:

```bash
render deploys create srv-d8eh4cc2m8qs738tesd0
```

On this Windows machine, the installed CLI path is
`%LOCALAPPDATA%\Programs\RenderCLI\render.exe`.

## Vercel client

1. Import the repository in Vercel.
2. Set the production environment variable:

```text
VITE_WORLD_SERVER_URL=wss://<render-service-host>
```

3. Deploy with the default Vite build. `vercel.json` pins the build command and
   output directory.

## Local production check

```bash
npm run server
npm run build
npm run preview
```

For local multiplayer testing from another device on the same network, override
the server URL before running Vite:

```bash
VITE_WORLD_SERVER_URL=ws://<your-lan-ip>:8765 npm run dev -- --host 0.0.0.0
```
