# [eloop](https://hsp-ec.xyz/eloop) — An Event Management Platform

An event-management application with hierarchical roles, dynamic registration forms,
and QR-based check-ins. Maintained by [HSP](https://hsp-ec.xyz).

This branch runs the Next.js App Router application with **vinext + Cloudflare Workers**.
Turso is configured manually; no Vercel integration or provisioning is required.

## Local setup

Install Bun and a Node.js version supported by Wrangler, then:

```sh
bun install --frozen-lockfile
cp .env.example .env.local
```

Fill in `.env.local` for build-time settings, including `NEXT_PUBLIC_*` values.
Copy server settings to `.dev.vars` for local Workers dev/preview. Both files are
gitignored. Never put real secrets in tracked files or `NEXT_PUBLIC_*` variables.

### Manual Turso configuration

Reuse an existing database with its current URL/token, or create one yourself:

```sh
turso auth login
turso db create eloop
turso db show eloop --url
turso db tokens create eloop
```

Set `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` from those commands or the Turso dashboard.
For a **new, empty database only**, explicitly initialize the tables:

```sh
bun run db:init
```

This creates tables, not a database. It is the existing bootstrap script, not a schema
migration system: it skips initialization if the `events` table exists. Existing deployments
should retain their current schema. Dev, build, and deploy never run database initialization.

### Authentication and server settings

Required runtime settings (set manually as Worker secrets):

| Setting | Value |
| --- | --- |
| `ADMIN_EMAIL` | Initial administrator email; applies when that user is first created |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google OAuth Web application credentials |
| `NEXTAUTH_URL` | Canonical app URL; locally `http://localhost:3000` |
| `NEXTAUTH_SECRET` | Strong random session secret |
| `QR_SECRET` | Separate strong random QR-signing secret |
| `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` | Manually managed Turso credentials |

In [Google Auth Platform](https://console.cloud.google.com/), add the app URL as an
authorized JavaScript origin and `<NEXTAUTH_URL>/api/auth/callback/google` as an
authorized redirect URI. Register both local and production URLs as needed.

Preserve `QR_SECRET` during migration so issued QR codes remain valid. Preserve
`NEXTAUTH_SECRET` too; changing hostname can still require users to sign in again.

```sh
bun run dev       # Workers-backed development on port 3000
bun run build     # Worker and browser assets in dist/
bun run preview   # Preview the built Worker locally on port 3000
```

If you use another port, update local `NEXTAUTH_URL` and Google OAuth URIs to match.

## Cloudflare deployment

`wrangler.jsonc` defines the `eloop` Worker with Node.js compatibility.
No D1, R2, KV, cache, or Images resources are required. Images are served without
Cloudflare resizing. vinext is beta; validate on a
staging hostname before switching production traffic.

1. Authenticate with `bunx wrangler login`, or set `CLOUDFLARE_API_TOKEN` for CI.
2. Set `CLOUDFLARE_ACCOUNT_ID` for the target account. Adjust the Worker name in
   `wrangler.jsonc` if necessary.
3. Configure the eight required runtime settings above as Worker secrets using
   the Cloudflare dashboard (Workers & Pages → eloop → Settings → Variables and Secrets)
   or `wrangler secret put`. Do not commit their values.
4. Set production `NEXTAUTH_URL` and register its Google OAuth callback.
5. Supply `NEXT_PUBLIC_*` settings from `.env.example` in the build environment
   (`.env.local` locally, or CI build variables). They are embedded in browser assets.
6. Run `bun run deploy`. This builds and deploys; it never runs `db:init`.

Set secrets interactively (Wrangler can offer to create the Worker on first use):

```sh
bunx wrangler secret put TURSO_DATABASE_URL
bunx wrangler secret put TURSO_AUTH_TOKEN
# Repeat for the other six required server settings.
```

Deployment uses `vite build` followed by `wrangler deploy`. The Cloudflare Vite plugin
generates the deployment configuration under `dist/` and redirects Wrangler to it.

Optional runtime settings: `QR_EXPIRATION` (default `30d`), `CSV_EXPORT_KEY`,
`CSV_MAILER_LINK`, and `CSV_MAILER_PRIMARY`. Configure them in Workers settings if used.
PostHog proxy host overrides in `next.config.ts` are build-time settings.

Before cutting over, verify Google login/logout, protected routes, registration,
QR generation/check-in, CSV exports, and PostHog proxying on staging.

With local preview running and the matching local-only settings in `.dev.vars`:

```sh
bun --env-file=.dev.vars scripts/smoke-workers.ts
```

The smoke check exercises auth endpoints, signed sessions, proxy redirects, HTML rendering,
and QR signing without accessing Turso or completing a real Google OAuth exchange.

## License

- Licensed under AGPL.
- PRs welcome. For major changes, open an issue first to discuss scope.
- Original concept & backend: <https://github.com/homebrew-ec-foss/eventloop>
- Tilde 4 Project: <https://homebrew.hsp-ec.xyz/posts/tilde-4.0-eventloop/>
