# AGENTS.md

## Mode: BUILD (autonomous)
- Read ALL context/*.md first every session.
- question tool FORBIDDEN during build - decide defaults, log in progress-tracker.md.
- Ticket-by-ticket from build-plan.md, verify each with npm run verify.
- Branch per feature, never on main. Never commit/push until user approves.

## Project
Hotel booking platform. Two independent projects in one repo:
`backend/` (NestJS 12, ESM) and `frontend/` (Nuxt 4). Neon Postgres via Prisma 7,
Cloudinary images, Stripe test-mode payments.

**Not a workspace. No `packages/shared`.** Separate `package.json` and lockfiles. The only
contract between the two is the HTTP API, described by `backend/openapi.json`; the
frontend's types are generated from it. Never import across the boundary.

## Before you touch anything
1. Read `context/project-overview.md`, `context/architecture.md`, `context/code-standards.md`.
2. Read the ticket in `context/build-plan.md` you are about to build.
3. Check `context/progress-tracker.md` for decisions already made. Do not re-litigate them.
4. Update `context/ui-registry.md` when you add a component.
5. Do not fight the generators — `nest new` and `nuxi init` set ESM, Vitest, oxlint and
   TypeScript 6 on purpose. Read `context/architecture.md` before adding tooling.

## Verify
`npm run verify` from the repo root — builds both projects, tests the backend, lints both.
A ticket is not done until it passes.

## Commands
```
npm run verify                              # build + test + lint everything
npm run build:backend / build:frontend
npm run test:backend
npm run dev:backend / dev:frontend           # both on separate terminals
npm --prefix backend run <script>            # run any backend script
npm --prefix frontend run <script>          # run any frontend script
```
