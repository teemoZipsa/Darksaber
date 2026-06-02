# Deployment

This project has two deployable pieces:

- Vite client: static files from `npm run build`
- World server: Node WebSocket service from `server/index.ts`
- PostgreSQL: account/session/character/save persistence

## Local PostgreSQL

For local development with the real account DB:

```bash
copy .env.example .env
npm run db:up
npm run db:check
npm run server
```

Run the Vite client in another terminal:

```bash
npm run dev
```

The local `.env.example` points both client endpoints at `localhost:8765` and
sets:

```text
DATABASE_URL=postgres://darksaber:darksaber_dev_password@127.0.0.1:5432/darksaber
AUTH_REFRESH_COOKIE_SECURE=0
```

`AUTH_REFRESH_COOKIE_SECURE=0` is for local plain HTTP only. In production,
omit it or set it to `1` so refresh tokens are only stored in Secure HttpOnly
cookies.

The world server creates the PostgreSQL tables on startup when `DATABASE_URL`
is present. `npm run db:check` also creates the tables and prints row counts.
Confirm the running server is using the database by checking `/healthz`; the JSON
should include:

```json
{ "authStore": "postgres" }
```

The public client must be built with a public WebSocket URL:

```bash
VITE_WORLD_SERVER_URL=wss://your-world-server.example.com npm run build
```

The public client must also know the auth HTTP endpoint:

```bash
VITE_AUTH_SERVER_URL=https://your-world-server.example.com npm run build
```

Use `wss://` for production HTTPS pages. Browsers usually block insecure
`ws://` connections from an HTTPS site.

`VITE_WORLD_SERVER_URL` and `VITE_AUTH_SERVER_URL` are required for production
gameplay. If they are omitted, the client can load static assets but account
login, world deployment, and the shared market cannot be used until the server
URLs are configured.

## Production PostgreSQL

Use a managed PostgreSQL database for deployed accounts. Set these environment
variables on the world server:

```text
DATABASE_URL=postgres://...
AUTH_JWT_SECRET=<long random secret>
AUTH_ALLOWED_ORIGINS=https://your-client-domain.example.com
AUTH_REFRESH_COOKIE_SAMESITE=Lax
NODE_ENV=production
```

For a split client/server deployment, keep `SameSite=Lax` only when they are
same-site. If the auth server and client are cross-site, switch to:

```text
AUTH_REFRESH_COOKIE_SAMESITE=None
```

and keep Secure cookies enabled. The server refuses to start in production if
`AUTH_JWT_SECRET` is missing.

## Render WebSocket server

1. Push the repository to GitHub.
2. In Render, create a Blueprint from this repository, or create a Web Service manually.
3. Use these settings if creating it manually:
   - Build command: `npm ci`
   - Start command: `npm run server`
   - Health check path: `/healthz`
4. Attach a Render PostgreSQL database or another managed PostgreSQL provider.
5. Set the server environment variables from the Production PostgreSQL section.
6. After deploy, copy the public service URL and use it as:

```text
VITE_WORLD_SERVER_URL=wss://<render-service-host>
VITE_AUTH_SERVER_URL=https://<render-service-host>
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
VITE_AUTH_SERVER_URL=https://<render-service-host>
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
