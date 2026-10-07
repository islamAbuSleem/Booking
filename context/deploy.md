# Deployment

## Env var contracts

- **API** (`backend/.env`): all vars in `backend/.env.example`. `DATABASE_URL` is the
  pooled runtime URL; `DIRECT_URL` is the direct migration URL. Getting these backwards
  exhausts the Neon connection budget.
- **Web** (`frontend/.env`): all vars in `frontend/.env.example`. `NUXT_PUBLIC_API_BASE`
  is the browser-facing API base; `NUXT_API_BASE_URL` is the server-side SSR base.

## API — Dockerfile

`backend/Dockerfile` builds a two-stage Node 22 image. Run it after setting the env vars:

```
docker build -t booking-api backend/
docker run -p 3000:3000 --env-file backend/.env booking-api
```

## Web — Vercel

`frontend/vercel.json` points at `npm run build` with `.output/public` as the output.
Set the `NUXT_PUBLIC_*` and `NUXT_API_BASE_URL` vars in the Vercel project settings.
Netlify is equivalent: build `npm run build`, publish `.output/public`.

## Neon setup runbook

1. Create a Neon project and a database. Copy the pooled host (`*-pooler`) for
   `DATABASE_URL` and the direct host for `DIRECT_URL`.
2. Run migrations with the direct URL: `cd backend && npx prisma migrate deploy`.
3. Seed if needed: `cd backend && npm run db:seed`.
4. Confirm the pooled URL is what the runtime `DATABASE_URL` uses.

## First-deploy checklist

- [ ] Run `prisma migrate deploy` against the production database.
- [ ] Register both OAuth callbacks with each provider:
  - Google: `https://<api-host>/api/auth/google/callback`
  - GitHub: `https://<api-host>/api/auth/github/callback`
  Both providers reject a non-https callback outside localhost.
- [ ] Set the Stripe webhook URL to `https://<api-host>/api/payments/webhook` and copy the
  signing secret into `STRIPE_WEBHOOK_SECRET`.
- [ ] Set Cloudinary credentials in `CLOUDINARY_*` and verify an upload round-trip.
- [ ] Set `FRONTEND_ORIGIN` on the API to the deployed web origin (never `*`).
- [ ] Set `NUXT_PUBLIC_API_BASE` on the web app to the deployed API origin.
- [ ] Smoke-test `/api/health` and load `/` and `/hotels` on the deployed web.
