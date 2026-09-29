# SquashCode Studio Backend

Express and TypeScript API for SquashCode Creative Studio.

## Local Setup

```bash
npm install
cp .env.example .env
npm run dev
```

## Scripts

- `npm run dev` starts the API with `tsx watch`.
- `npm run lint` runs ESLint.
- `npm run build` compiles TypeScript into `dist/`.
- `npm run start` runs the compiled API from `dist/index.js`.

## Cloudflare Workers

This repository includes `wrangler.jsonc` and `worker.ts`. Cloudflare Workers Builds should use:

- Root directory: repository root
- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`

The Worker serves the Express API at `/api` and responds to `/health`. `npm run start` still runs
the Node server locally or on Render.

In Cloudflare Worker **Settings → Variables and Secrets**, set these runtime values:

- `SUPABASE_URL`: text variable for the Supabase project URL.
- `SUPABASE_ANON_KEY`: secret for requests scoped by a signed-in user.
- `SUPABASE_SERVICE_ROLE_KEY`: secret containing the actual service role key for server-side uploads and shared reads.
- `OPENAI_API_KEY`: secret for AI generation.
- `CORS_ORIGIN`: text variable set to `https://squashcode-studio-frontend.shyanilsquashcode.workers.dev` (also allowed by the code default).

Optional runtime variables: `OPENAI_MODEL` (defaults to `gpt-5`),
`CPANEL_UPLOAD_DELETE_URL`, and `CPANEL_SUPPORTING_UPLOAD_URL` for the legacy cPanel integration.
The Worker needs no build-time secret. `wrangler.jsonc` preserves text variables set in the
dashboard across deploys. Do not put keys in `wrangler.jsonc` or GitHub.

Apply the SQL files in `supabase/` to the matching Supabase project before using their features.
Storage setup is in `supabase/creative-studio-storage.sql`; the JSON folder feature uses
`supabase/prompt-json-folders.sql`.

## Render (legacy)

This repository includes `render.yaml` so Render creates a Node web service with:

- Build command: `npm ci && npm run build`
- Start command: `npm run start`
- Healthcheck path: `/health`

The API binds to `0.0.0.0` and reads the port from `PORT`. Render provides `PORT`
automatically and defaults it to `10000` for web services.

Set the required environment variables in Render before deploying:

- `OPENAI_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY` or a real `SUPABASE_SERVICE_ROLE_KEY`

`SUPABASE_SERVICE_ROLE_KEY` is optional and must contain the real Supabase service-role key, not the
anon key. If you do not set it, set `SUPABASE_ANON_KEY`; authenticated API requests forward the
user's bearer token to Supabase so RLS policies using `auth.uid()` continue to pass.

The internal Creative Generator uses all-user reads for prompt generations and generated creatives.
Use a real `SUPABASE_SERVICE_ROLE_KEY`, or use `SUPABASE_ANON_KEY` together with the internal
authenticated read policies below, so everyone on the team can see all reference images and JSON
prompts.

If Render is using `SUPABASE_ANON_KEY` instead of a real `SUPABASE_SERVICE_ROLE_KEY`, run
`supabase-internal-read-policies.sql` in the Supabase SQL editor. It keeps RLS enabled, but allows
authenticated team users to read all saved JSON presets, prompt assets, sessions, and creatives.

Optional environment variables:

- `OPENAI_MODEL` defaults to `gpt-5`.
- `SUPABASE_ANON_KEY` can be used when all database access should run through user-scoped RLS.
- `CORS_ORIGIN` accepts comma-separated deployed frontend origins. Use `https://squashcode-studio.netlify.app` for the Netlify frontend.
- Generated and reference images are stored in the Supabase Storage bucket `creative-studio-assets` (see `supabase/creative-studio-storage.sql`). `SUPABASE_SERVICE_ROLE_KEY` is required for server-side uploads.
- `PORT` is provided by Render automatically and defaults to `4000` locally.
