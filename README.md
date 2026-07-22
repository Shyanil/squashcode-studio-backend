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

## Render

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
- `CPANEL_UPLOAD_DELETE_URL` defaults to `https://api.squashcode-studio.7sc.in/upload_delete.php`.
- `CPANEL_SUPPORTING_UPLOAD_URL` defaults to `https://api.squashcode-studio.7sc.in/upload_supporting.php`.
- `PORT` is provided by Render automatically and defaults to `4000` locally.
