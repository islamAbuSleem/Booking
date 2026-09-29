# Stitch Prompts

Prompts for generating UI designs in Stitch (stitch.withgoogle.com). One prompt per screen
— a focused prompt generates a usable screen, a sprawling one generates a generic hero.

**How to use this file**

1. Paste the **System Style** prompt once, at the start of a session. It establishes the
   aesthetic and the tokens.
2. Then paste one **Screen** prompt at a time, in build-plan order.
3. Generate desktop (1440px) and mobile (390px) separately. Stitch does not carry a
   responsive model across prompts, so the mobile prompt states its own layout rules.
4. Any output that drifts back to the anti-patterns below — shadowed cards, blue
   gradients, Inter, emoji icons — regenerate with the rejection clause appended.

Generated designs are a **reference, not a specification**. `context/design.md` and
`context/ui-tokens.md` are authoritative. If Stitch produces something that contradicts
them, the design system wins and the prompt was wrong.

---

## System Style

Paste this first, in every session.

```
Design a hotel booking platform UI. The aesthetic is EDITORIAL TRAVEL GUIDE — a
printed city guide that happens to be a booking engine. Not a SaaS dashboard, not a
marketplace card grid, not an AI-generated template.

PALETTE — use these exact values, do not substitute:
  Page background (warm bone paper): #F7F4EF
  Card surface (near-white warm):     #FFFDFA
  Inset / skeleton / table stripe:     #EFEAE1
  Ink panel (footer, dark blocks):     #1F1B16
  Hairline border:                     #DED7CA
  Input border at rest:                #B9AE9C
  Text primary (warm black ink):       #1F1B16
  Text secondary:                      #6B635A
  Text placeholder:                    #918878
  Accent, solid fills only:            #A63D22  (deep terracotta)
  Accent hover:                        #8E3319
  Accent on paper, large text only:    #C9522F
  Accent wash (tinted bg):             #F6E7E1
  Link / info (deep teal):             #1F4E5F
  Link hover:                          #163B48
  Success:                             #3F6B4A
  Warning:                             #8A6A1F
  Danger:                              #8C2F22

CRITICAL CONTRAST RULE: white (#FFFDFA) is the ONLY text colour permitted on a
terracotta (#A63D22) fill. Never put the ink colour #1F1B16 on terracotta — that
pairing fails WCAG AA at about 2.6 to 1. Buttons and fills use white text. Teal
#1F4E5F is for links and information only, never for a large button fill.

TYPOGRAPHY:
  Display / headlines:  Fraunces (a high-contrast serif with a slightly irregular,
                        characterful feel). Weights 400 only for large sizes.
  Body / UI / numbers:  Archivo. Weights 400, 500, 600.
  Booking reference codes: IBM Plex Mono.
  All prices, dates, and any number in a column use TABULAR FIGURES (fixed-width
  digits) so columns align and numbers do not shift when they change.
  Body paragraphs are left-aligned, never centred. Cap line length at about 68
  characters.
  Uppercase letter-spaced labels (0.75rem, 0.08em tracking) for field labels and
  section eyebrows.

SHAPE AND DEPTH — this is what makes it look designed rather than generated:
  Card corners are SQUARE. 2px radius maximum, and only on inputs, buttons, and
  small badges. No rounded corners on cards, images, panels, or containers.
  NO PILL SHAPES. Status badges, chips, and tags are rectangular at 2px radius —
  never 9999px, never stadium-shaped, never fully rounded.
  NO DROP SHADOWS on cards, buttons, or images. Separation comes from 1px #DED7CA
  hairline rules and generous whitespace. The only permitted shadow is on true
  overlays (modal, dropdown, sticky bar): 0 8px 24px rgba(31,27,22,0.10).
  Spacing is generous: 96-128px between desktop sections, 48-64px on mobile.
  Data tables are DENSE: 64px row height, hairline row rules, no vertical borders,
  numbers right-aligned with tabular figures, status badges on one line only.

COMPOSITION:
  Asymmetric layouts. Text does not centre and paragraphs never centre.
  Where a section pairs text with an image, the split is deliberately uneven
  (5 columns to 7), with the image bleeding past the right grid edge.
  Photography is the ONLY saturated imagery. Keep all decorative colour out of the
  interface so the photographs carry the colour.
  12-column grid, 1280px max content width, 24px gutters.

REJECT — do not produce any of these:
  No purple, indigo, or blue-to-teal gradients. No gradient backgrounds at all.
  No glassmorphism, frosted glass, or backdrop-blur panels.
  No drop shadows on cards.
  No large border radii (no pill-shaped or heavily rounded cards).
  No centred hero with a headline, subheadline, and two buttons side by side.
  No three identical feature cards in a row, each with an icon.
  No emoji used as interface icons.
  No Inter, Roboto, Arial, or a generic system font stack.
  No centred body paragraphs.
  No stars as the only way a rating is shown.
  No lorem ipsum or grey placeholder blocks — use realistic written content.
  No dark mode.
  NO PILL-SHAPED BADGES OR CHIPS. Rectangular at 2px radius only.
  No invented institutional metadata in the masthead — no volume numbers, issue
  numbers, edition names, or inspection counts. Brand and navigation only.
  No decorative index numbers on cards. Every number shown must be real data.
  No text baked into photographs — no nav links, buttons, or labels rendered
  inside an image.
  No clipped or truncated text anywhere. If a label does not fit, the column is
  too narrow, not the text.

CONTENT TONE: specific and unsalesy. Name the place, the room, the rate, the
constraint. "Free cancellation until 24 hours before check-in", not "Unlock amazing
deals". Errors state the fix: "Check-in must be before check-out", not "Invalid date
range".

Generate a 1440px-wide desktop screen first.
```

---

## Screens

Generate in this order. Each states its own content and states.

### 1. Home — `/`

```
Screen: the home page of the hotel booking platform.

Layout, top to bottom:
1. A slim header on the paper background. Wordmark in Fraunces at left. Inline nav
   links (Stays, Destinations, About) in Archivo. A right-aligned "List your property"
   link in teal with an underline, and a square terracotta "Sign in" button with white
   text.
2. An ASYMMETRIC hero — deliberately not centred. Left 5 columns: an eyebrow label in
   uppercase letterspacing, then a large Fraunces headline at about 3.5rem reading
   "Find a place worth staying in", left-aligned, with a short 68-character-max
   supporting paragraph in ink-muted. Below it, a horizontal search widget in a
   hairline-bordered panel: four fields in one row — Destination, Check-in,
   Check-out, Guests — each with a real label above the input, then a terracotta
   "Search" button with white text. Right 7 columns: a large 16:9 photograph of a
   sunlit hotel courtyard, square corners, bleeding slightly past the right grid
   edge.
3. A "Featured stays" section. Left-aligned Fraunces section heading at 2.5rem with a
   small terracotta rule above it. A 3-column grid of hotel cards.
4. Hotel card anatomy, repeated: 3:2 photograph, square corners, 1px #DED7CA border,
   no shadow. Top-left overlay label pill reading "Guest favourite". Below the image:
   city and country as an uppercase letterspaced label, hotel name in Fraunces at
   about 1.875rem, an amenity row of 3 items with an overflow count, then a rating
   number with a review count, then the price in Archivo 600 with tabular figures,
   "per night" in small muted text. A heart icon button in the top-right corner of
   the image with a 44px tap target.
5. A destinations strip: three square-cornered 4:3 photographs with the city name in
   Fraunces overlaid, laid out asymmetrically — the first wider than the other two.
6. A dark ink footer (#1F1B16) with the wordmark, three columns of links in
   #F7F4EF, and a hairline top border in #DED7CA at 20% opacity.

Content: use real-sounding properties. "The Larkspur Hotel, Lisbon", "Casa Verde,
Oaxaca", "Hotel Nord, Copenhagen". Real rates in USD — $214, $189, $342.
```

### 2. Hotel list — `/hotels`

```
Screen: the hotel search results page. This is a DENSE utility screen — deliberately
tighter and calmer than the home page, because the user's task is comparison, not
browsing.

Layout: 320px sticky left sidebar, 12-column content area to the right.
1. Left sidebar, hairline right border, no card treatment. Sections separated by 1px
  rules with uppercase letterspaced labels: Destination (text input with a small
   "Use my location" link), Dates (check-in and check-out stacked, checkout disabled
   until check-in is chosen), Guests (stepper with - and + in square buttons),
  Price per night (a dual-ended range slider with the current range in tabular
   figures below it), Amenities (a list of 7 square checkboxes: Wifi, Pool, Parking,
   Breakfast, Pet friendly, Air conditioning, Workspace), Star rating (5 square
  checkboxes). At the bottom, a terracotta "Show 24 stays" button with white text,
  full sidebar width.
2. Content header row: "24 stays in Lisbon" in Fraunces at 1.875rem on the left, and
  a "Sort by" select on the right with "Recommended" selected. Hairline below.
3. Three-column grid of hotel cards, 24px gaps, matching the home card anatomy.
   Cards 2 and 5 in the grid are skeleton placeholders in #EFEAE1 to represent
   loading, with no shimmer.
4. Below the grid, a square-outlined pagination: numbered 1 2 3 then an arrow.
   Current page is a terracotta fill with white text.
5. An inline result-count line in small muted text directly under the header.

Content: 24 real Lisbon properties. Names like "The Larkspur Hotel", "Casa do Fado",
"Hotel Bairro Alto", "Palácio Riverside". Ratings 8.1 to 9.6 with review counts.
Rates $96 to $612. Use varied 3:2 photographs — building facades, a courtyard pool, a
twin room interior, a rooftop terrace, a breakfast spread.
```

### 3. Hotel detail — `/hotels/[id]`

```
Screen: a single hotel property page. Editorial density — this is the browsing
surface, so it should breathe.

Layout: a 7/5 asymmetric split in the upper region.
1. Header, same as home.
2. Left 7 columns: a large 16:9 photograph, square corners, of a hotel exterior.
   Beneath it a 3-up row of smaller 4:3 photographs (a twin room, a bathroom, a
   rooftop terrace), each square-cornered, 8px gaps.
3. Right 5 columns, sticky: the booking bar. An uppercase letterspaced label
   "The Larkspur Hotel" is wrong here — instead: city and country as a label, the
   hotel name in Fraunces at 2.5rem, a rating row with a bold number, "Excellent",
   and "1,284 reviews" as text, a two-line description in ink-muted capped at 68
   characters per line, a hairline rule, then the price "from $214" in Fraunces at
   1.75rem with tabular figures and "per night" in small muted, then a full-width
   terracotta "Check availability" button with white text, then a centred small
   muted line "Free cancellation until 24 hours before check-in" with a small
   checkmark icon.
4. Full-width section below: "Rooms" as a left-aligned Fraunces heading at 2.5rem
   with a small terracotta rule above. Two room cards side by side, square corners,
   1px border. Each has a 4:3 room photo, room name in Fraunces at 1.875rem, an
   amenity line, "Sleeps 2" as a label, the rate in Archivo 600 with tabular
   figures, and a square outlined "Select room" button.
5. "What guests say" section: a rating breakdown of 5 horizontal hairline bars
   labelled Cleanliness, Location, Comfort, Facilities, Staff, each with a bar and a
   count in tabular figures, sitting in a 320px left column; on the right, three
   review cards stacked, each with a reviewer's initials in a square circle, name,
   a rating number, a title in Fraunces, and body copy capped at 68 characters per
   line.
6. "Location" section: a 4:3 static map placeholder in #EFEAE1 with the address in
   ink-muted beneath it.
7. A sticky bottom bar on mobile only: "from $214 per night" plus a terracotta
   "Check availability" button, with content space reserved so it never covers text.
```

### 4. Booking / checkout — `/hotels/[id]/book`

```
Screen: the booking flow. This is a TRANSACTIONAL screen — intentionally denser,
tighter, and calmer than the hotel detail page. Editorial layout on a payment form
reads as unserious. Square corners, hairlines, tabular figures, no imagery except
small thumbnails.

Two columns: 7 columns of form, 5 columns of sticky order summary.
1. A breadcrumb in small muted text: "Home / Stays / The Larkspur Hotel / Book".
   A left-aligned Fraunces heading at 2.5rem: "Confirm your stay".
2. Form sections, each with an uppercase letterspaced label above a 1px hairline:
   - YOUR STAY: a read-only summary card — the 4:3 room thumbnail (80px square
     corners), room name, and a "Change" link in teal. Then check-in and check-out
     date inputs, and a guests stepper with - and + square buttons.
   - GUEST DETAILS: Full name, Email, Phone, all with labels above inputs, inputs
     with 1px #B9AE9C borders, 2px radius, 48px tall.
   - PAYMENT: a card number field, an expiry field, a CVC field, laid out in a row
     with the two short fields at one-third width. Below, a small muted line:
     "This is a Stripe test-mode checkout. Use 4242 4242 4242 4242."
3. Right column, sticky, in a panel with a 1px border and no shadow: "Order summary"
   as a label. A small 4:3 hotel thumbnail. Hairline-ruled rows, every number in
   tabular figures and right-aligned: "$214 × 4 nights" / "$856" subtotal, "Taxes and
   fees" / "$94", hairline, then "Total" in Fraunces at 1.75rem with the amount
   right-aligned. Below, a cancellation policy block in small muted text: "Free
   cancellation until 24 hours before check-in on 14 March. After that, 50% of the
   first night is non-refundable."
4. A full-width terracotta "Confirm and pay" button with white text, 52px tall,
   inside the left column. Beside it in small muted text, a lock icon and "Payments
   are processed securely by Stripe."
5. An inline error example, shown on the check-out field: a 1px #8C2F22 border, a
   #F7E6E3 background, and the message "Check-out must be after check-in" in
   #8C2F22 at 14px.

States to also generate as a variant: the same screen with the button in a loading
state — "Confirming…" with a small inline spinner, button disabled, 60% opacity.
```

### 5. Trips — `/bookings`

```
Screen: the guest's trips page. Calm, scannable, table-like on desktop.

1. Header. Then a left-aligned Fraunces heading at 2.5rem: "Your trips", with a
   hairline below.
2. Two tabs in uppercase letterspaced Archivo: "Upcoming" (active, with a 2px
   terracotta underline) and "Past". Hairline under the tab row.
3. On desktop, a data table: uppercase letter-spaced #6B635A column headers —
   Booking, Hotel, Check-in, Check-out, Guests, Status, Total. Rows separated by 1px
   hairlines, 14px rows, 64px tall. The booking reference in IBM Plex Mono. The
   hotel name in Fraunces at 1.25rem. Dates in tabular figures. Total right-aligned
   in tabular figures. Status is a pill — a 1px border with a #E6EEE7 or #F5EEDC
   wash background and #3F6B4A or #8A6A1F text, never a solid fill.
4. On mobile, the same data as a stacked card per booking, hairline-separated, with
   label-above-value pairs using the uppercase label style.
5. Below the table, pagination.

Content: three upcoming bookings and two past. One upcoming in a #F5EEDC warning
pill "Check-in tomorrow", one #3F6B4A success pill "Confirmed", one #DED7CA neutral
pill "Awaiting payment". One past booking with an indigo-free review prompt in a
#F6E7E1 accent-wash block: "How was your stay at Casa Verde?" with a small square
outlined "Write a review" button.
```

### 6. Auth — `/login`

```
Screen: a centred sign-in page. Narrow and calm.

Layout: a single 420px column, horizontally centred, on the page background. No card
container — sit directly on the paper with a 1px hairline top border, editorial.
1. The wordmark in Fraunces at 1.875rem, centred.
2. A Fraunces heading at 2.5rem: "Welcome back", centred.
3. A one-line supporting paragraph in ink-muted, centred, max 34 characters.
4. Email and Password inputs, full column width, 48px tall, 2px radius, 1px
   #B9AE9C borders, real labels above in the uppercase label style.
5. A row between the fields: a square checkbox "Remember me" on the left, and
   "Forgot password?" in teal on the right.
6. A full-width terracotta "Sign in" button, 52px tall, white text.
7. A hairline rule with the word "or" centred in small muted text breaking it.
8. Two full-width outlined buttons, square, 1px #DED7CA border, 48px tall, each
   with a small monochrome SVG brand mark on the left: "Continue with Google" and
   "Continue with GitHub".
9. Below, in small muted: "New here? Create an account" with "Create an account" in
   teal.

Error state variant: an inline alert above the buttons — a 1px #DED7CA border, a
#F7E6E3 background, a small warning icon, and the text "That email and password
combination didn't match an account." at 14px in #8C2F22.

States to also generate: the button in a loading state with a small inline spinner and
the label "Signing in…", disabled at 60% opacity.
```

### 7. Host dashboard — `/dashboard/host`

```
Screen: the property manager's dashboard. Dense, calm, data-first. A 240px left
sidebar plus a content area.

1. Left sidebar in #1F1B16 ink, full height, square corners, no shadow. The wordmark
   in Fraunces in #F7F4EF. Nav items in #F7F4EF at 60% opacity, the active item
   "Properties" at full opacity with a 2px #A63D22 left border. A user block pinned
   to the bottom: a 1:1 circular avatar, name, and a small "Host" label.
2. Content header: a left-aligned Fraunces heading at 2.5rem "Your properties" with
   a square terracotta "Add property" button with white text on the right.
3. A row of four stat cards, hairline-bordered, no shadow, no padding ornamentation.
   Each: an uppercase letterspaced label, a large Fraunces number with tabular
   figures, and a small muted delta line. Cards: "PUBLISHED PROPERTIES 12",
   "UPCOMING BOOKINGS 34", "OCCUPANCY 78%", "REVENUE THIS MONTH $41,280".
4. A properties data table: uppercase letter-spaced headers — Property, City, Status,
   Rooms, Upcoming, Rating, Action. Rows hairline-separated. Property name in Fraunces
   with a 48px square-cornered thumbnail. Status as a pill. Rating with a number and
   review count. The action is a small square outlined "Edit" button.
5. A second panel, "Recent bookings": a compact table with reference in mono, guest
   name, property, check-in date, total in tabular figures, and a status pill.

Content: 5 properties — "The Larkspur Hotel" (Lisbon, Published, 12 rooms, rating 9.2),
"Casa Verde" (Oaxaca, Published, 8 rooms, 8.7), "Hotel Nord" (Copenhagen, Published,
20 rooms, 9.0), "Rooftop No. 4" (Lisbon, Pending review, 5 rooms, no rating),
"Casa del Mar" (Barcelona, Rejected, 9 rooms, 8.1). Use a #F5EEDC warning pill for
"Pending review" and a #F7E6E3 danger pill for "Rejected".
```

### 8. Admin dashboard — `/dashboard/admin`

```
Screen: the admin moderation console. Same shell as the host dashboard but with an
"Admin" label on the user block, a terracotta-tinted sidebar accent, and moderation
content.

1. Same ink sidebar. Nav: Overview, Listings, Users, Reviews, Bookings. "Listings"
   active with the 2px #A63D22 left border.
2. Header: a left-aligned Fraunces heading at 2.5rem "Listings" with a "Filter by
   status" select on the right showing "Pending review".
3. A row of three stat cards, hairline-bordered: "PENDING REVIEW 7", "ACTIVE USERS
   1,204", "REPORTS OPEN 2". Numbers in Fraunces with tabular figures.
4. A moderation table: uppercase letter-spaced headers — Property, Host, City,
   Submitted, Status, Action. Rows hairline-separated. Each row ends with two square
   buttons side by side: a filled #3F6B4A "Approve" with white text, and an outlined
   button with a #8C2F22 border and #8C2F22 text reading "Reject".
5. Below, a "Flagged reviews" panel: three review cards, each with a warning pill
   "Reported", the review body capped at 68 characters per line, the reported reason
   in small muted text ("Reported for containing a competitor's contact details"), and
   Hide / Keep buttons.

Content: five pending properties from plausible hosts — "Villa Aurora" (Tbilisi,
submitted 2 days ago), "The Barn at Fen End" (Norfolk), "Hotel Casa Verde Annex"
(Oaxaca), "Riad Al Jazira" (Marrakech), "Lakeside Lodge" (Queenstown).
```

---

## Corrected home hero — regenerate this one

The Gazette home page had good bones and one bad element: **the search widget**, which is
the primary conversion control on the page and came out as a cramped single strip with a
truncating date field. The masthead also carried five clusters of invented metadata
(`VOL. XIV · NO. 88`, `EDITION IV`, `AUTUMN EQUINOX EDITION`, `INSPECTIONS FILED: 142
LODGINGS WORLDWIDE`, `STANDARD VERIFIED`) that pushed the real nav into second place.

Re-paste the System Style prompt, then this. Everything below the hero is unchanged from
Screen 1.

```
Screen: the hero section only of the hotel booking platform home page. Generate the
hero and nothing else — do not continue into featured listings, destinations, or footer.

MASTHEAD — restrained. Left: the wordmark "The Gazette" in Fraunces with a small
"EST. 2024" beneath it. Centre or right: the real navigation, clearly legible and
prominent — Stays, Destinations, Trips, About. Far right: a "List your property" link
in teal with an underline, and a square terracotta "Sign in" button with white text.

DO NOT add any of these, all of which appeared in an earlier draft and are being
removed: volume or issue numbers, edition names, seasonal edition labels, inspection
counts, or any "standard verified" / "registry" / "ledger" framing. The masthead
carries the brand and the navigation and nothing else.

HERO — asymmetric, 5 columns of text to 7 columns of image, image bleeding slightly
past the right grid edge.

Left 5 columns:
- An eyebrow label in terracotta, uppercase, letter-spaced: "CURATED LODGINGS".
- A Fraunces headline at 3.5rem, left-aligned, tight leading, on two lines:
  "Find a place worth staying in."
- One supporting paragraph in ink-muted, left-aligned, capped at about 68 characters
  per line, two lines maximum.
- Then the SEARCH WIDGET, which is the most important element on this page and must
  be given real space. Treat it as a proper component, not a strip in a table row.

  The search widget is a hairline-bordered panel on #FFFDFA, 1px solid #DED7CA,
  square corners, spanning the full 5-column width, sitting on the paper with
  comfortable padding around it. Inside it, a 2x2 grid of fields — NOT one cramped
  row of four:
    Row 1: "Destination" (text input, full width of the left cell) and
           "Guests" (a stepper with minus and plus in small square buttons, showing
           "2 guests, 1 room").
    Row 2: "Check-in" (date input) and "Check-out" (date input, both full width of
           their cell, dates fitting completely with no truncation).
  Every field has a real uppercase letter-spaced label ABOVE the input. Field
  heights are 48px. The date text must be fully legible with no ellipsis and no
  clipping.
  Below the fields, spanning both columns, a full-width terracotta button reading
  "Search" in white, 52px tall.
  A single line of small muted text beneath the panel: "Free cancellation on most
  stays · No booking fees".

Right 7 columns: a large 16:9 photograph of a sunlit hotel courtyard, square corners,
filling the column with a subtle bottom-edge scrim only where a caption sits. A
small caption in white over the scrim: "Palácio Belmonte Courtyard, Lisbon". No
text of any kind baked into the photograph itself — no nav links, no login links,
no interface elements inside the image.

Below the hero, show only a hairline rule and generous whitespace to indicate the
section boundary. Do not render any further content.
```

### If the widget still comes out cramped
Regenerate with this appended:

```
The search widget is too small and the date fields are truncating. Enlarge the
search panel to fill the full 5-column width of the hero's left side. Arrange the
four fields in a 2x2 grid with 16px gaps, not a single horizontal row. Make each
input 48px tall and wide enough to show a full date such as "Oct 14, 2025" with
room to spare. Increase the panel's internal padding. The search widget must be
the visually dominant element of the left column — larger and clearer than the
headline above it.
```

---

## Rejection clause

If a generation drifts, append this to the screen prompt and regenerate:

```
That result violates the system style. Correct these specific problems:
[shadow on the card — delete it and use a 1px #DED7CA hairline]
[rounded card corners — make them square, 2px maximum]
[gradient background — remove it entirely, the page is flat #F7F4EF]
[ink text on the terracotta button — change to #FFFDFA white]
[centred paragraph — left-align it]
[Inter or Roboto — set headlines in Fraunces and body in Archivo]
[emoji icons — replace with simple monochrome line SVGs]
[price figures jittering — enable tabular figures]
Regenerate with the palette and shape rules exactly as specified above.
```

## Known Stitch limitations

- It does not hold a design system across prompts. The System Style prompt must be
  re-pasted per screen or values drift between them.
- Responsive behaviour is not inferred. Desktop and mobile are separate generations with
  their own prompts.
- Generated text content is usually placeholder-ish. Treat the copy as a layout
  placeholder and replace it with the voice rules in `context/design.md`.
- Output is a visual reference. `context/design.md` and `context/ui-tokens.md` are
  authoritative where the two disagree.
