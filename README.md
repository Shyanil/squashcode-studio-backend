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
- `SUPABASE_SERVICE_ROLE_KEY`

`SUPABASE_SERVICE_ROLE_KEY` is preferred for server-side fallback operations. If you do not set it,
set `SUPABASE_ANON_KEY`; authenticated API requests forward the user's bearer token to Supabase so
RLS policies using `auth.uid()` continue to pass.

Optional environment variables:

- `OPENAI_MODEL` defaults to `gpt-5`.
- `SUPABASE_ANON_KEY` can be used when all database access should run through user-scoped RLS.
- `CORS_ORIGIN` accepts comma-separated deployed frontend origins. Use `https://squashcode-studio.netlify.app` for the Netlify frontend.
- `CPANEL_UPLOAD_DELETE_URL` defaults to `https://api.squashcode-studio.7sc.in/upload_delete.php`.
- `CPANEL_SUPPORTING_UPLOAD_URL` defaults to `https://api.squashcode-studio.7sc.in/upload_supporting.php`.
- `PORT` is provided by Render automatically and defaults to `4000` locally.
