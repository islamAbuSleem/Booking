# Design System

Direction, layout patterns, and component anatomy. Colour and type **values** are in
`context/ui-tokens.md` and are referenced by token name here, never restated — two files
holding the same hex is two files that will drift.

## The direction

**Editorial travel guide.** A printed city guide that happens to be a booking engine.

The failure mode for hotel booking UI is the marketplace card grid: centred hero, stock
photos, one blue "Book now", everything symmetric, nothing memorable. That is the default
an AI will produce and the default a user has seen ten thousand times. This system is the
opposition.

Four commitments:

1. **Photography is the only saturated thing on the page.** The interface is warm paper
   and ink so the photographs carry all the colour. Any attempt to add a colourful
   gradient, a colour block, or a coloured illustration fights the images.
2. **Hairlines, not shadows.** Separation is `--color-rule` and whitespace. This alone
   removes most of the generic look — the shadow-on-every-card habit is a strong tell.
3. **Asymmetric, content-driven layout.** Text columns do not centre and paragraphs never
   centre — **in editorial and listing contexts**. A narrow, single-purpose form (auth,
   a 420px column) is centred, because left-aligning it looks broken and centred is the
   established convention there. The rule constrains prose and display, not forms. See
   D48.
4. **Every space carries a number, a name, or a rate.** Never a decorative index.

The Gazette wordmark (`The Gazette` + `EST. 2024`) is kept — it is the one piece of
masthead theatre that earns its place, because it is the brand. Everything else invented in
the name of the editorial concept is cut. See "Print costume to avoid" below.

## Naming
The design explorations converged on the wordmark **"The Gazette — EST. 2024"** without it
being specified; the model invented it and reused it across 6 of 10 generations. Treat it
as a **proposal, not a decision** — it is a real product and the name is the owner's to
choose. It is used throughout the specs because it is what the references show, and
renaming is a find-and-replace on one token, not a redesign.

## Known defects in `design/` and their rulings

`design/` holds 13 exploration folders. Two are discarded branches
(`home_editorial_travel_guide`, `home_grand_tour_dispatch`), one is an orphan
(`editorial_hotel_guide_logo`), and ten are the converged "The Gazette" set. They are a
**visual reference, not spec** (D21). Every defect observed in them is ruled on here so
the build does not reintroduce it.

| Observed in the references | Ruling |
|---|---|
| Host table rows ~114px, property name wrapping to 2 lines | Row height fixed at 64px, `nowrap` on names, column widened. See the data-table rules in `ui-tokens.md` |
| The 4 stat-card numbers on the dashboard not sharing a baseline | Stat labels are `label-caps`, one line, shortest label that fits. Numbers share a baseline |
| "REVIEW NOTES" button wider than the "EDIT" buttons in the same column | Action columns are a fixed width; all buttons in one match |
| "PENDING REVIEW" badge wrapping to two lines | Badges are `white-space: nowrap`; a wrapping badge is a width bug |
| `$41,280` · `$1,420.00` · `$214 /per night` on one screen | One money format per context. See the money table in `ui-tokens.md` |
| Pill-shaped amenity chips on room cards, square badges elsewhere | **All pills struck.** Every badge and chip is `r-sm` (2px) |
| Rating bars all near full-width, differences illegible | Bars normalised to the visible min–max, not 0–10. Raw number always shown |
| Search widget cramped, "Check-out Oct 19, 2025" truncating | Reworked. It is the primary conversion control and gets the room it needs — see the corrected prompt in `context/stitch-prompts.md` |
| "Copenhagen" title and its "14 stays" badge clipped at the right edge | Asymmetric destination cards need `overflow` handling and a min-width on the overlay. The 1-big-2-small rhythm is kept, the clipping is not |
| "Login / Sign up" and a nav bar rendered *inside* the hero photograph | A generation artifact, not a layout. Text must never be baked into an image asset. Review every image before use |
| Garbled review badge text ("FROM A LEXIC N.") | Generation artifact. Copy is authored, not generated |
| A real map screenshot with vendor attribution baked in | Not usable. Needs a real map provider decision (see below) — do not ship a screenshot |
| "Library ·2 missing space before "2 more" | Trivial but real. Amenity overflow joins with `", "` separators, not a bare `·` |

### Open decision: maps
`/hotels/[id]` has a "Location" section and the references use a screenshot. That is not
shippable — it carries third-party attribution and is not interactive or accessible. The
MVP options are a static styled placeholder with a link out to directions, or a real
embedded map provider. **Not yet decided.** Until it is, build the placeholder and keep
the component seam so a provider can be dropped in. Flagged rather than silently assumed.

## Print costume to avoid
The explorations overcooked the concept. These are the specific inventions to **not**
carry into the build — they are costume that displaces function:

| Invented in the references | Why it goes |
|---|---|
| `VOL. XIV · NO. 88`, `EDITION IV`, `AUTUMN EQUINOX EDITION` | Five competing metadata clusters while the real nav is visually secondary. A user cannot find "Stays" |
| `INSPECTIONS FILED: 142 LODGINGS WORLDWIDE` / `STANDARD VERIFIED` | Implies an editorial process the product does not have. Not a lie we should tell |
| `No. 014` / `No. 027` / `No. 639` on hotel cards | Pure noise. No information, no action |
| `REGISTRY REF: #LDG-8820`, `Ledger Hash: 0x7c9…82a9` | Implies a ledger, an archive, and a sync engine that do not exist |
| `Auto-reconciliation via Gazette Treasury Engine v4.1` | Invented infrastructure |
| `PROPRIETOR COVENANT`, `Archivist & Luminary Sovereignty` | Syllable armour. Says nothing |
| `PLATE NO. 01 · ARCHITECTURAL DOSSIER`, `FROM A LEXIC N.` | Faux-cataloguing, and the second one is garbled text |
| `Curator's Pick`, `Guest Favourite` | Fabricated endorsements. If the product cannot substantiate "guest favourite", it must not claim it |

The distinction to keep: **editorial layout is the aesthetic, editorial fiction is not.**
Whitespace, asymmetry, hairlines, and a serif carry the feel. Invented institutional
history is just noise that pushes real controls off the screen.

Real metadata is fine and encouraged — city, country, star rating, amenity counts, review
counts, "from $214/night". Only the fictional institutional layer is cut.

**Density is not uniform, deliberately.** Discovery surfaces (home, list, detail) are airy
and image-forward. Transactional surfaces (book, bookings, both dashboards) are tight,
gridded, and calm — an editorial layout on a payment form reads as unserious. The change
in density between `/hotels/[id]` and `/hotels/[id]/book` is intentional, not drift.

## Voice

Copy is specific and unsalesy. No "Unlock amazing deals", no "Your dream stay awaits".
Name the place, the room, the rate, the constraint.

- ✅ "Free cancellation until 24 hours before check-in"
- ✅ "Ocean view king · sleeps 2 · $214/night"
- ❌ "Book now and save big!"
- ❌ "Experience luxury like never before"

Errors state the fix: "Check-in must be before check-out" not "Invalid date range".

## Layout system

12-column grid, 1280px max, 24px gutter (16px mobile). Section rhythm 96–128px desktop,
48–64px mobile.

- **Editorial block** — text left, image right, deliberately unequal (5/7, not 6/6).
  Bleeds off the right grid edge. Used on home and hotel detail.
- **Utility panel** — 320px sidebar, dense rows, sticky. Filters, price summary, sort.
  Square corners, hairline dividers, no card shadow.
- **Data table** — Archivo 14px, `tabular-nums` in every numeric column, hairline row
  rules, right-aligned numbers, uppercase `label` headers. Used in both dashboards.
- **Status pill** — the only `r-full` element. 1px border, tinted wash background,
  `label` type. Never a filled solid pill.

## Responsive

Breakpoints 375 (base) / 768 (tablet) / 1280 (desktop). Mobile-first.

| Pattern | Mobile | Tablet | Desktop |
|---|---|---|---|
| Global nav | hamburger + bottom sheet | hamburger | inline links, full |
| Hotel grid | 1 col | 2 col | 3 col |
| Filter sidebar | bottom sheet, drag handle | slide-over | 320px sticky left |
| Hotel detail hero | stacked, image above | image above, book bar below | 7/5 split, sticky book bar |
| Editorial block | stacked | stacked | 5/7 asymmetric |
| Data table | card-per-row | card-per-row | full table |
| Dashboard | tab bar | sidebar | 240px sidebar |
| Checkout | single column, sticky total bar | 2 col | 2 col, order summary right |

Rules that hold at every width:
- No horizontal scroll at 320px.
- Body text stays 16px minimum — never shrink type to fit.
- Tap targets 44px minimum.
- The booking bar and the order summary remain reachable without scrolling back up on
  mobile; they are sticky.
- Image aspect ratios hold at every breakpoint. Never let a card change shape.

## Component anatomy

**HotelCard** — 3:2 image, cover flag as a `label` pill top-left, city + country in
`label`, name in Fraunces `display-m`, amenity row (max 3 + overflow count), rating with
review count, price in `price` with `tabular-nums` and `/night` in `small` muted. Hairline
border, no shadow, `r-none`. Favourite toggle is an icon button, top-right, 44px target.

**SearchWidget** — one horizontal row on desktop (destination, dates, guests, submit),
stacked with full-width fields on mobile. Labels above inputs, not placeholders. Dates use
a range picker with the checkout field disabled until check-in is set. Submit is `accent`,
white text.

**PriceSummary** — sticky, hairline-ruled rows: nightly rate × nights, subtotal, taxes and
fees, total in `price-lg`. Every figure `tabular-nums` and right-aligned. Total is the
only emphasised row. No animations on figures changing.

**BookingBar** (hotel detail) — sticky bottom on mobile, sticky right on desktop. Shows
"from $X/night", primary availability button, and the next free date when sold out. Never
covers content; reserve space for it.

**RatingBreakdown** — 5 horizontal hairline bars, label + bar + count, `tabular-nums`.
Bars in `accent` on `surface-alt`. Not stars-as-graphic-only; the number is always present
as text for screen readers.

**ThreadView** (T35) — messages left/right by sender, square corners, timestamp in `small`
muted, day dividers as `label`. Unread indicated by a rule colour change *and* a count,
never colour alone.

## Anti-patterns

Explicitly reject these. Each is a default an AI will reach for and each breaks the system:

- Purple or blue-to-teal gradients, especially on white
- Glassmorphism, frosted panels, `backdrop-blur` cards
- Drop shadows on cards, buttons, or images
- Rounded corners beyond `r-sm` on cards or containers
- A centred hero with a headline, a subhead, and two buttons
- Three identical feature cards in a row with an icon each
- Emoji as interface icons
- A star row as the only rating display
- Inter, Roboto, Arial, or the system font stack
- Full-bleed centred paragraph text
- "Lorem ipsum" or placeholder-grey placeholder content — use realistic copy everywhere
- Dark mode built speculatively (not in the MVP, per `ui-tokens.md`)

## Motion

As specified in `ui-tokens.md`. The intent: motion confirms an action and never
entertains. No reveal-on-scroll, no parallax, no entrance animation on page content —
content is present on first paint because it is SSR'd. Transitions are reserved for state
changes the user caused: a dropdown opening, a modal entering, a row being added.

## Accessibility

WCAG 2.1 AA is a build requirement, not a review stage. The palette's contrast pairs are
tabulated in `ui-tokens.md`; the trap to remember is ink on terracotta, which fails.

Beyond contrast:
- The `label` type style is uppercase and tracked — it must still hit 4.5:1. It does.
- Fraunces at `display-m` and below is fine for text; `display-xl` is for heroes only.
- Focus ring is 2px `--color-accent` with a 2px offset, visible on paper and on images.
  Never `outline: none` without a replacement.
- Every icon-only control has an `aria-label`.
- Modals trap focus, restore it on close, and close on `Escape`.
- Async errors announce through an `aria-live="polite"` region.
- Colour is never the sole carrier of status — pill, rule, and text all change.
