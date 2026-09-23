# Deploy to Cloudflare

Scout runs on Cloudflare Workers + Static Assets (Nitro preset `cloudflare_module`), talking to a Supabase Postgres database through Hyperdrive.

## 1. Prerequisites

- A Cloudflare account.
- A Supabase project.
- `pnpm exec wrangler login`

## 2. Database

In Supabase → Connect, use the *Direct connection* string, or the *Session pooler* (port 5432) if direct is IPv6-only. Never use the transaction pooler (port 6543).

Run migrations from your laptop:

```bash
DATABASE_URL='<supabase url>' pnpm run db:migrate
```

Optional seed:

```bash
DATABASE_URL='<supabase url>' pnpm run db:seed
```

## 3. Hyperdrive

```bash
pnpm exec wrangler hyperdrive create scout-db --connection-string='<supabase url>' --caching-disabled
```

Caching is disabled because writes don't invalidate cached reads. Paste the printed id into `wrangler.jsonc`.

## 4. Secrets

```bash
pnpm exec wrangler secret put NUXT_SESSION_PASSWORD     # from: openssl rand -base64 32
pnpm exec wrangler secret put NUXT_ENCRYPTION_KEY       # openssl rand -base64 32
```

If you're updating an existing deployment, run migration `0004` against Supabase before deploying (`DATABASE_URL='<supabase url>' pnpm run db:migrate`) — it adds the column used to store per-user Claude API keys.

## 5. Users

Accounts live in the database, not in secrets. Create one from your laptop, against the Supabase database:

```bash
DATABASE_URL='<supabase direct url>' pnpm run user:add <name>
```

Reset a password the same way:

```bash
DATABASE_URL='<supabase direct url>' pnpm run user:passwd <name>
```

Once signed in, users can change their own password from the account menu.

## 6. Deploy

```bash
pnpm run deploy
```

The app is served at `https://scout.kauper.co` (custom domain via `routes` in `wrangler.jsonc`; DNS record and certificate are created on deploy). The `workers.dev` and preview URLs are disabled, so the custom domain is the only entry point.

## 7. Local Workers preview

```bash
CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE=postgres://scout:scout@localhost:5433/scout pnpm run preview:cf
```

Put `NUXT_SESSION_PASSWORD` in `.dev.vars` for local preview.

## 8. Notes

- Ollama is unreachable in the cloud deployment (`OLLAMA_URL` is empty), but AI works once a user saves their own Claude API key in Account → AI settings.
- Rotating `NUXT_SESSION_PASSWORD` signs everyone out.

### Upgrading from a single-account deployment

1. Run `pnpm run db:migrate` against the Supabase database (migrates existing data to a placeholder `owner` account).
2. Set its password: `DATABASE_URL='<supabase direct url>' pnpm run user:passwd owner`.
3. Deploy: `pnpm run deploy`.

Between step 1 and the deploy landing, creating projects/tags/columns/tasks fails (the old, still-running code doesn't set `user_id`). Existing sessions are signed out once after the deploy (the session shape changed).

Once the upgrade is live, remove the now-unused secrets: `wrangler secret delete NUXT_AUTH_USERNAME` and `wrangler secret delete NUXT_AUTH_PASSWORD_HASH`.
