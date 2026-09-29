# AGENTS.md

## Mode: BUILD (autonomous)
- Read ALL context/*.md first every session.
- question tool FORBIDDEN during build - decide defaults, log in progress-tracker.md.
- Ticket-by-ticket from build-plan.md, verify each with npm run build.
- Branch per feature, never on main. Never commit/push until user approves.

## Project
Hotel booking platform. Nuxt 4 frontend, NestJS 12 API, Neon Postgres via Prisma,
Cloudinary images, Stripe test-mode payments. npm workspaces monorepo.

## Before you touch anything
1. Read `context/project-overview.md`, `context/architecture.md`, `context/code-standards.md`.
2. Read the ticket in `context/build-plan.md` you are about to build.
3. Check `context/progress-tracker.md` for decisions already made. Do not re-litigate them.
4. Update `context/ui-registry.md` when you add a component.

## Verify
`npm run build && npm run test` from the repo root. A ticket is not done until both pass.
