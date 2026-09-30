# Working Notes

Cross-session operational knowledge. Not domain spec — that lives in
`architecture.md`, `code-standards.md`, and `library-docs.md`. This file is for the things
that cost time to rediscover.

## The parallel agent ownership fence

The two-project layout (`D36`) is what makes running a FE agent and a BE agent at the
same time safe. The directories share no files, no lockfiles, no `node_modules`. **But
directory separation alone is not sufficient.** The fence that actually worked:

| Owner | Scope | Never touches |
|---|---|---|
| BE agent | `backend/` | `frontend/`, `context/`, root `package.json`, any `.gitignore` |
| FE agent | `frontend/` | `backend/`, `context/`, root `package.json`, any `.gitignore` |
| Orchestrator | `context/`, `AGENTS.md`, root `package.json`, `.gitignore`, **all verification** | — |

Four rules made it work:

1. **Neither agent runs the root build.** `npm run verify` compiles *both* projects, so
   two agents running it fight over `.output/`, `dist/`, and the Nuxt cache. Each agent
   runs only its own project's `build` / `test` / `lint`. The orchestrator runs the root
   verify afterwards, alone.
2. **One owner per shared file.** `context/progress-tracker.md` and `.gitignore` are
   written by the orchestrator only. Two agents appending to the same progress file is a
   lost-update race, and an agent with no `.gitignore` access cannot fix its own
   generated-code leak.
3. **Pass the hard-won findings into the brief, verbatim.** Each agent prompt repeats
   the verified library traps rather than saying "read library-docs.md". A subagent that
   rediscovers the Prisma 7 `P1012` wastes a cycle, and one that guesses may write
   plausible wrong code.
4. **The orchestrator resolves contradictions between agents.** Two agents working from
   the same spec will disagree. See the rating scale below.

### Subagents may need an opencode restart

If `task` calls fail with an opencode session-store insert error
(`Failed query: insert into "session" ...`), the runtime is broken, not your prompt.
Three attempts including a no-op probe will all fail identically. **Restart opencode.**
A probe is the cheapest test: launch an agent asked to reply with one word and use no
tools, before committing to a parallel plan.

## A green build is not a finished ticket

`npm run verify` passing means the code compiles, tests pass, and lint is clean. It does
**not** mean the ticket is done. Caught twice this way:

- **T3** specified 12 hotels. Six were written, the build was green, and the shortfall
  was only visible by counting fixtures against the ticket text. Ship that silently and
  you have a half-built ticket with a passing gate.
- **D34** flagged a Tailwind risk that turned out to need measuring. Assuming the fix
  would have left a broken config behind a green build.

Check the ticket's own acceptance criteria, not just the verify command.

## Corrections are cheap; shipping a wrong thing is not

Two examples where a first attempt was wrong and reverting was the right call:

- A rescale script halved every number inside a `rating(...)` call, including **review
  counts** (1,284 → 642). Counts are a different quantity from scores. Reverted via
  `git checkout` and redone with a narrower pattern.
- A PowerShell `-replace` intended to turn `t(` into `$t(` also matched inside the
  existing `$t(`, producing `$$t(`. One line, immediately visible on read-back.

Reverting a local uncommitted change costs nothing. Shipping it costs a migration later.

## Resolved contradictions worth remembering

- **Ratings are 1–5, not 1–10** (`D43`). `architecture.md` is authoritative. The T3
  fixtures were 1–10 and had to be rescaled. No display transform — a hidden ×2 is
  exactly the kind of thing that drifts, and showing "9.4" for a 1–5 input range
  misstates the scale.
- **`minPrice` / `maxPrice` are major units** (`D44`). The only place in the API where
  money is not integer cents. Kept because a user typing a price filter means dollars.
- **`null` is never `0`** (`D45`) for `priceFrom`, `rooms[].price`, or `rating.average`.
  A missing price renders as "—", not "$0", because free and missing are different
  states.

## Stale paths after a restructure

When a directory layout changes, `.gitignore` and every `context/*.md` reference keep
pointing at the old paths. `apps/api/src/generated/` sat in `.gitignore` after `apps/`
was deleted, so `backend/src/generated/` had no rule — and a commit was one `git add -A`
away from carrying 21 generated files.

**After any layout change, grep the specs and the ignore files for the old paths.** The
verify command will not catch this; nothing references a nonexistent path at build time.

## Tooling traps in this environment

- **PowerShell string matching fails on markdown list lines.** `-like "*- [ ] T5 ...*"`
  returned MISS on lines that `Select-String` found verbatim. `[` and `]` are wildcard
  characters in `-like`. For bulk text edits, use a `node -e` script with `String.includes`.
- **`[id].vue` needs `-LiteralPath`.** `Get-Content` treats the brackets as a wildcard and
  reports the file does not exist. The file is fine.
- **Vue i18n: `t()` is not available in templates.** Templates get `$t()`; `<script setup>`
  needs `const { t } = useI18n()`. Mixing them up is a typecheck error, not a runtime one.
- **`Get-ChildItem` filters and regex replacement over `path/to/*.vue`** will
  double-apply. Read the file after any scripted edit.

## Frontend ↔ backend contract

The contract is `backend/openapi.json`, generated by `@nestjs/swagger` and committed.
A test asserts it is byte-identical to what the running API serves, so it cannot drift
silently. Generate the frontend types with:

```
npx openapi-typescript ../backend/openapi.json -o types/api.ts
```

**Never hand-write the frontend types to match a DTO.** That is the drift the
contract-first approach (D38) exists to prevent, and it is strictly worse than the
`packages/shared` package it replaced.

`app/utils/mock/types.ts` is a **placeholder**, shaped like the API responses so the swap
is mechanical. It is deleted at T13a. Do not import it into shared frontend code, and do
not treat it as authoritative — the backend DTOs are.

## What is not installed

`/project-init` and `/project-build` exist. **`/delegate` and `/remember` do not.** If a
workflow needs a subagent fan-out, it is described in this file rather than invoked as a
command, until one is written.
