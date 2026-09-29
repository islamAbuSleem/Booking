# UI Tokens

Single source of truth for colour and type values. **No hardcoded hex, rgb(), or hsl() in
component or template code.** New colour → add it here first.

Defined in `frontend/app/assets/css/main.css` inside a Tailwind v4 `@theme` block, which
turns each `--color-*` into a utility (`bg-surface`, `text-fg`).

Aesthetic direction and everything not expressible as a token lives in
`context/design.md`. Tokens are referenced by name there, never restated.

## Palette — "Editorial Travel"

Warm paper base, deep warm-black ink, one saturated terracotta accent, one restrained teal
for links. Photography is the only saturated imagery in the product; the UI stays quiet so
the photos carry the colour.

```css
@theme {
  /* Surfaces — warm, never pure white or pure grey */
  --color-bg:          #F7F4EF;  /* paper */
  --color-surface:     #FFFDFA;  /* card / raised paper */
  --color-surface-alt: #EFEAE1;  /* inset, table stripe, skeleton */
  --color-surface-inv: #1F1B16;  /* ink panel, footer */

  /* Lines */
  --color-rule:        #DED7CA;  /* hairline border, the default divider */
  --color-rule-strong: #B9AE9C;  /* input border at rest */

  /* Text */
  --color-fg:          #1F1B16;  /* ink — body and headings */
  --color-fg-muted:    #6B635A;  /* secondary copy, captions */
  --color-fg-subtle:   #918878;  /* disabled, placeholder */
  --color-fg-inv:      #F7F4EF;  /* text on ink panels */

  /* Accent — terracotta */
  --color-accent:       #A63D22;  /* SOLID FILLS, white text on top (6.4:1) */
  --color-accent-hover: #8E3319;
  --color-accent-bright:#C9522F;  /* on paper: large text + rules only (4.0:1) */
  --color-accent-wash:  #F6E7E1;  /* tinted backgrounds */

  /* Teal — links, info, and the one cool note */
  --color-link:       #1F4E5F;     /* 7.1:1 on paper — safe for body-size links */
  --color-link-hover: #163B48;
  --color-info:       #1F4E5F;
  --color-info-wash:  #E4EDF0;

  /* Status */
  --color-success:      #3F6B4A;  /* 5.5:1 on paper */
  --color-success-wash: #E6EEE7;
  --color-warning:      #8A6A1F;
  --color-warning-wash: #F5EEDC;
  --color-danger:       #8C2F22;
  --color-danger-wash:  #F7E6E3;
}
```

### Non-negotiable contrast rules

Measured against `--color-bg` (`#F7F4EF`) unless noted. AA is a project rule, not a goal.

| Combination | Ratio | Verdict |
|---|---|---|
| `fg` on `bg` | ~15:1 | AAA — body text, headings |
| `fg-muted` on `bg` | ~5.9:1 | AA — secondary copy |
| `link` on `bg` | ~7.1:1 | AAA — links at body size |
| `success` on `bg` | ~5.5:1 | AA |
| **white on `accent`** | ~6.4:1 | **AA — the only valid text on an accent fill** |
| `accent-bright` on `bg` | ~4.0:1 | AA large text only (≥24px, or ≥19px bold) |
| `fg` on `accent` | ~2.6:1 | **FAILS — never put ink on terracotta** |
| `fg-subtle` on `bg` | ~2.8:1 | Disabled/placeholder only, never body text |

**The one trap:** terracotta is the brand colour and ink is the text colour, so the
obvious pairing is a fail. On any accent fill, text is `#FFFDFA` or nothing. Verify with a
contrast checker before shipping any new colour pair — these ratios are hand-computed and
one rounding error matters at 4.5:1.

Dark mode is **not** in the MVP. `ui-rules.md` mentions legible email rendering in dark
clients; that is a client-side email concern, not a second app theme. Do not build a dark
palette speculatively — if it is ever wanted, it is a ticket with its own contrast audit.

## Typography

Fraunces for display, **Archivo Narrow** for the dense functional layer, Archivo for
prose, IBM Plex Mono for references. No Inter, no Roboto, no system stack — the
`frontend-design` guidance is explicit that these are the house style of generic AI
output.

**Archivo Narrow was not in the original spec.** Both Stitch themes independently chose
it, and the rendered tables prove why: narrow type is what lets a data table stay dense
while still reading as editorial. Adopted deliberately.

```css
@theme {
  --font-display: "Fraunces", "Iowan Old Style", Georgia, serif;
  --font-sans:    "Archivo", "Helvetica Neue", sans-serif;
  --font-narrow:  "Archivo Narrow", "Archivo", sans-serif;
  --font-mono:    "IBM Plex Mono", ui-monospace, monospace;
}
```

### Which font where

| Layer | Font | Why |
|---|---|---|
| Headlines, prices in display size, quotes | `font-display` (Fraunces) | character; sizes ≥ 20px only |
| **Tables, stat cards, labels, buttons, form controls, nav, filters, status** | `font-narrow` (Archivo Narrow) | density — the whole point of adopting it |
| **Long-form prose: hotel descriptions, review bodies, editorial paragraphs** | `font-sans` (Archivo) | narrow at 16–18px over 68ch is tiring to read |
| Booking references, coordinates, hashes, "N of 12" | `font-mono` | alignment and machine-legibility |

The split matters. Narrow everywhere, including prose, is a real accessibility cost, and
it is the one place the density push should yield to legibility.

Load via `@nuxtjs/google-fonts` with `display: swap`, preconnect, and only the weights
used: Fraunces 400/500, Archivo 400/500/600, Archivo Narrow 400/500/600, Plex Mono 400.
Loading four families is already at the budget edge — subset aggressively and do not add a
fifth.

### Scale

| Token | Font | Size / line-height | Weight | Tracking | Use |
|---|---|---|---|---|---|
| `display-xl` | Fraunces | 3.5rem / 0.95 | 400 | -0.02em | Home hero only |
| `display-l` | Fraunces | 2.5rem / 1.0 | 400 | -0.015em | Page titles, section openers |
| `display-m` | Fraunces | 1.875rem / 1.1 | 400 | -0.01em | Section headings |
| `title` | Archivo | 1.25rem / 1.3 | 600 | -0.01em | Card titles, panel heads |
| `body` | Archivo | 1rem / 1.6 | 400 | 0 | Body |
| `body-lg` | Archivo | 1.125rem / 1.7 | 400 | 0 | Lead paragraphs, hotel description |
| `small` | Archivo | 0.875rem / 1.5 | 400 | 0 | Captions, metadata |
| `label` | Archivo | 0.75rem / 1.2 | 500 | 0.08em, uppercase | Field labels, eyebrow text |
| `price` | Archivo | 1.25rem / 1.2 | 600 | 0 | Rates — **always `tabular-nums`** |
| `price-lg` | Fraunces | 1.75rem / 1.1 | 400 | -0.01em | Hero rate — **always `tabular-nums`** |
| `ref` | IBM Plex Mono | 0.875rem / 1.2 | 400 | 0.04em | Booking references, codes |

### Typography rules
- **Prices, dates, and any number in a column use `font-variant-numeric: tabular-nums`.**
  Proportional figures make a price list shimmer and prevent columns from aligning. This
  is the single highest-craft detail in the type system.
- Fraunces gets `font-variation-settings: "SOFT" 0, "WONK" 1` for display sizes only. The
  wonk is the character; at body size it looks like a bug.
- Body copy is Archivo, not the serif. Long descriptions in a display serif at 16px are
  hard to read and undercut the editorial feel.
- Line length capped at ~68ch for any paragraph. Full-bleed text blocks are a defect.
- Never centre a paragraph. Editorial is left-aligned or justified, never centred.

## Spacing & shape

4px base grid. Radii are small — the editorial look depends on restraint, and large radii
are the fastest way back to generic.

| Token | Value | Use |
|---|---|---|
| `r-sm` | 2px | **the default** — inputs, buttons, status badges, checkboxes, chips |
| `r-md` | 4px | dropdowns and popovers only |
| `r-none` | 0 | cards, images, panels, sections, tables, modals, drawers |

**There is no `r-full` token. Pill shapes do not exist in this system.** This supersedes
the earlier draft of this file, which allowed `r-full` for status badges. Two Stitch
themes disagreed about it and the renders disagreed with both; the renders came out
square, and square is right — the tinted wash plus the label text already carry the
status, and a pill adds a soft organic shape that fights the hairline grid. Status
badges are `r-sm`. If a design calls for a pill, that is a signal the element is doing
the wrong job, not that it needs more radius.

- Cards and images are **square-cornered**. Shadows are near-absent; separation comes from
  `--color-rule` hairlines and whitespace.
- Section rhythm on desktop: 96–128px vertical. Mobile: 48–64px.
- Content max width 1280px, prose max 68ch, sidebar 320px.
- One `shadow` token, for overlays only (modal, dropdown, sticky bar):
  `0 8px 24px rgb(31 27 22 / 0.10)`. Nothing else gets a shadow.

## Data tables
Dashboards and trip lists. The Gazette renders proved the direction but also that a table
built without a density rule sprawls to ~114px rows. These are fixed, not suggested.

- **Row height 64px.** A 48px thumbnail is the tallest permitted cell content. If a value
  wraps, the column is too narrow — fix the column, never let the row grow.
- **`white-space: nowrap` on status badges and action buttons.** A badge that wraps to two
  lines breaks the row rhythm and is always a width bug, never a content bug.
- **Action columns are a fixed width** and every button in them is the same width. "Edit"
  and "Review notes" in one column must not be different sizes.
- **Numbers right-aligned, `tabular-nums`.** Property and guest names left-aligned.
- **Status badges: one line, always.** Text is fixed vocabulary, never a live status
  string that could grow. `Published` / `Pending review` / `Rejected` / `Confirmed` /
  `Awaiting payment` / `Cancelled` / `Paid` / `Refunded`.
- **No vertical borders.** Hairline row rules only. Header row in `--color-surface-alt`
  with uppercase `label` text.
- **Stat cards above a table align.** Stat labels are `label-caps` on one line — use the
  shortest label that fits rather than letting it wrap and pushing the number down. All
  numbers in a row share a baseline.

## Money format
One rule per context, applied everywhere. Inconsistent decimals on a single screen is the
fastest way to look unfinished.

| Context | Format | Example |
|---|---|---|
| Listing and search cards | whole dollars, no decimals | `$214` |
| Stat cards and totals | whole dollars, no decimals, thousands separated | `$41,280` |
| Order summary, receipts, anything payable | 2 decimals, currency symbol first | `$856.00` |
| Per-unit suffix | `small`, muted, always present | `$214` + `/night` |

Never mix the two within one screen's table. Never append `/per night` with a leading
space inside the price element — `/night` is a separate element.

## Rating display
- The number is always present as text, not conveyed by stars alone. Stars are decorative.
- **Rating bars are normalised to the visible range, not to 0–10.** A set of scores
  between 8.4 and 9.3 drawn against a 0–10 axis renders as five near-identical full-width
  bars that communicate nothing. Scale the bars to `min–max` of the displayed set, label
  the axis, and show the raw number on every bar. If the range is degenerate (all scores
  equal), show a single flat bar rather than dividing by zero.
- Counts use `tabular-nums` and are never abbreviated ("428", not "428+").

## Motion

| Token | Duration | Easing | Use |
|---|---|---|---|
| `ease-editorial` | `cubic-bezier(0.2, 0, 0, 1)` | — | the default, all of it |
| `motion-fast` | 150ms | ease-editorial | hover, press, focus ring |
| `motion-base` | 240ms | ease-editorial | panel, dropdown, accordion |
| `motion-slow` | 320ms | ease-editorial | page transition, modal |

- No parallax, no scroll-jacking, no reveal-on-scroll on content. Editorial layout comes
  from the grid, not from animation.
- The only motion on a payment or confirmation path is a spinner state change.
- `prefers-reduced-motion: reduce` collapses all durations to 0ms. No exceptions.

## Images
- Fixed crop ratios everywhere, so a grid never jitters: **3:2** cards, **16:9** hero,
  **4:3** gallery, **1:1** avatar.
- Every `<img>` declares `width` and `height` — CLS budget is 0.1 and this is most of it.
- Cloudinary transforms, never a raw original. `f_auto,q_auto` plus an explicit `w_`.
- Cover image is `priority` (eager + `fetchpriority="high"`). Everything else `loading="lazy"`.
- Alt text is descriptive and content-bearing: *"King room with floor-to-ceiling windows
  overlooking the harbour"*, not *"room photo"*.
