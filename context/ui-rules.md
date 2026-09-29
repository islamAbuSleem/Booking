# UI Rules

## Component conventions
- One component per file. No multi-component files. See "One component per file" in
  `context/code-standards.md` for the extraction rule and the check.
- Components: `PascalCase.vue` (e.g. `HotelCard.vue`).
- Composables: `camelCase.ts` with a `use` prefix (e.g. `useBookings.ts`).
- Types: `PascalCase.ts`.
- Nuxt auto-imports `app/components`, `app/composables`, `app/utils` — do not add
  explicit imports for those.
- Never add a second `.vue` file to a route directory. Reusable pieces go to
  `app/components`.

## Props
- No props drilling. Max two levels of pass-through, and only when the intermediate
  component actually reads the prop.
- Prefer a **slot** when the parent owns the data and the child owns the layout — it is
  the right answer most of the time. Scoped slots when the child shapes the content.
- Use **provide / inject** with a typed injection key from a single keys file for a
  genuine cross-cutting dependency. Never for a value one subtree uses.
- A prop bag (`options`, `rest`, `attrs`) forwarded down a tree is drilling in disguise.
- A component must not accept a prop it does not read.
- Derive rather than duplicate: if a value is computable from props, compute it in the
  child instead of passing it down from the parent.
- Full rules and the resolution order are in `context/code-standards.md` under
  "No props drilling".

## Data fetching
- `<script setup>` with top-level `await` for SSR data. Never `onMounted` for initial
  page data — it kills SSR and SEO.
- `useFetch` for simple GETs. `useAsyncData` for anything conditional, parameterized, or
  needing multiple sources.
- Every `useAsyncData` in a dynamic route must take a **unique key** derived from the
  route params, otherwise data leaks between `/hotels/a` and `/hotels/b`:
  ```ts
  const route = useRoute()
  const { data } = await useAsyncData(`hotel:${route.params.id}`, () =>
    $fetch(`/api/hotels/${route.params.id}`))
  ```
- Mutations use `$fetch` / `useFetch` with `method`; refresh the affected key with
  `refresh()` or `refreshNuxtData()`.
- Never call the API directly from a client-side-only path for SEO-critical content.

## Structure
- `layouts/default.vue` for public pages, `layouts/dashboard.vue` for host/admin.
- Route middleware in `app/middleware/` for auth redirects. It is UX only — the API
  enforces authorization independently and must never rely on it.
- Server-only secrets never reach the client: use `runtimeConfig.public` for anything
  browser-visible, `runtimeConfig` for everything else.

## Accessibility (WCAG AA)
- Semantic elements before ARIA. `<button>` for actions, `<a>` for navigation.
- Every input has a `<label>` bound with `for`/`id`. Placeholder is not a label.
- Visible focus ring on every interactive element. Never `outline: none` without a
  replacement.
- Color contrast ≥ 4.5:1 for body text, ≥ 3:1 for large text and UI boundaries.
- Icon-only buttons need `aria-label`.
- Modals and drawers trap focus and close on `Escape`.
- Images have meaningful `alt` text; decorative images take `alt=""`.

## SEO
- `useSeoMeta` on every public route. Title, description, and OG image.
- `/hotels` and `/hotels/[id]` are SSR and must render content in the initial HTML.
- Hotel detail pages emit `Product` / `Hotel` structured data via `useHead` JSON-LD.

## i18n
- `@nuxtjs/i18n` with `en` as the only locale in MVP. The structure is there so adding a
  locale is config, not refactoring.
- No hardcoded user-facing strings in templates — use `$t('...')`.

## Forms
- One schema per form in `app/composables/` or co-located, validated by the same Zod
  schemas in `packages/shared` that the API uses.
- Show field-level errors from the API response; do not rely on client-side validation
  alone.
- Disable submit while in flight. Every submit is idempotent from the UI's perspective.
