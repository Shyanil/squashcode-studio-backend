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

## Railway

This repository includes `railway.json` so Railway builds with Railpack and runs:

- Build command: `npm run build`
- Start command: `npm run start`
- Healthcheck path: `/health`

Set the required environment variables in Railway before deploying:

- `OPENAI_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Optional environment variables:

- `OPENAI_MODEL` defaults to `gpt-5`.
- `CORS_ORIGIN` accepts comma-separated deployed frontend origins.
- `CPANEL_UPLOAD_DELETE_URL` defaults to `https://squashcode-studio.7sc.in/upload_delete.php`.
- `CPANEL_SUPPORTING_UPLOAD_URL` defaults to `https://squashcode-studio.7sc.in/upload_supporting.php`.
- `PORT` is provided by Railway automatically and defaults to `4000` locally.
