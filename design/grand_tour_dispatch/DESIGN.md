---
name: Grand Tour Dispatch
colors:
  surface: '#fcf9f4'
  surface-dim: '#dcdad5'
  surface-bright: '#fcf9f4'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f6f3ee'
  surface-container: '#f0ede9'
  surface-container-high: '#ebe8e3'
  surface-container-highest: '#e5e2dd'
  on-surface: '#1c1c19'
  on-surface-variant: '#57423d'
  inverse-surface: '#31302d'
  inverse-on-surface: '#f3f0eb'
  outline: '#8b716b'
  outline-variant: '#dec0b9'
  surface-tint: '#a43c21'
  primary: '#86260c'
  on-primary: '#ffffff'
  primary-container: '#a63d22'
  on-primary-container: '#ffd0c4'
  inverse-primary: '#ffb4a2'
  secondary: '#376476'
  on-secondary: '#ffffff'
  secondary-container: '#b9e6fb'
  on-secondary-container: '#3c687a'
  tertiary: '#4d4741'
  on-tertiary: '#ffffff'
  tertiary-container: '#655f58'
  on-tertiary-container: '#e3dad1'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#ffdbd2'
  primary-fixed-dim: '#ffb4a2'
  on-primary-fixed: '#3c0800'
  on-primary-fixed-variant: '#84250b'
  secondary-fixed: '#bce9fe'
  secondary-fixed-dim: '#a0cde1'
  on-secondary-fixed: '#001f29'
  on-secondary-fixed-variant: '#1d4c5d'
  tertiary-fixed: '#eae1d8'
  tertiary-fixed-dim: '#cec5bd'
  on-tertiary-fixed: '#1f1b16'
  on-tertiary-fixed-variant: '#4b4640'
  background: '#fcf9f4'
  on-background: '#1c1c19'
  surface-variant: '#e5e2dd'
typography:
  display-xl:
    fontFamily: Fraunces
    fontSize: 56px
    fontWeight: '400'
    lineHeight: 64px
    letterSpacing: -0.02em
  display-xl-mobile:
    fontFamily: Fraunces
    fontSize: 38px
    fontWeight: '400'
    lineHeight: 44px
    letterSpacing: -0.01em
  headline-lg:
    fontFamily: Fraunces
    fontSize: 36px
    fontWeight: '400'
    lineHeight: 44px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Fraunces
    fontSize: 28px
    fontWeight: '400'
    lineHeight: 34px
  headline-md:
    fontFamily: Fraunces
    fontSize: 26px
    fontWeight: '400'
    lineHeight: 32px
  headline-sm:
    fontFamily: Fraunces
    fontSize: 20px
    fontWeight: '500'
    lineHeight: 26px
  body-lead:
    fontFamily: Archivo Narrow
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Archivo Narrow
    fontSize: 15px
    fontWeight: '400'
    lineHeight: 24px
  body-sm:
    fontFamily: Archivo Narrow
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  label-caps:
    fontFamily: Archivo Narrow
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.08em
  code-mono:
    fontFamily: Courier Prime
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
spacing:
  gutter: 1.5rem
  gutter-mobile: 1rem
  margin: 3rem
  margin-mobile: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.5rem
---

## Brand & Style

This design system models the quiet authority of high-end travel journalism, vintage gazetteers, and independent architectural quarterlies. Built explicitly for discerning travelers seeking deeply vetted stays, it rejects the loud, anxiety-inducing patterns of mass-market online travel agencies. There are no countdown timers, no artificial urgency badges, and no aggressive saturated accents.

Instead, the UI takes cues from heritage print: warm paper surfaces, rigorous hairline rulings, precise typographic pacing, and photographic stillness. The emotional resonance is calm, literary, highly curated, and exacting. 

The aesthetic is purely **Editorial Minimalism**:
- Content layout respects classical broadsheet proportions and editorial columns.
- Surface transitions mimic varied paper stock weights rather than digital layers.
- Form controls feel mechanical, deliberate, and structural.
- Every property reads as a feature story, prioritizing cultural context, architectural pedigree, and geographic specificity over generic feature checklists.

## Colors

The palette reproduces physical pigments: unbleached cotton rag, printer's ink, oxidized iron oxide, and deep sea sediment. 

### Roles & Tokens

- **Page Background (`#F7F4EF`)**: Warm bone paper foundation. Used for global page canvas and natural breathing margins.
- **Card Surface (`#FFFDFA`)**: Near-white warm surface. Provides subtle lift above the page background without using shadows.
- **Inset / Substrate (`#EFEAE1`)**: Tonal substrate for skeleton loaders, alternating table stripes, disabled fields, and badge backgrounds.
- **Ink Primary (`#1F1B16`)**: Deep warm charcoal-black used for headers, primary prose, structural icons, and solid footer/banner blocks.
- **Text Secondary (`#6B635A`)**: Balanced reading tone for metadata, subheadings, and secondary supporting descriptions.
- **Text Placeholder (`#918878`)**: Unfocused form labels, placeholders, and subtle editorial timestamps.
- **Accent Primary (`#A63D22`)**: Deep terracotta. Used exclusively for solid primary actions (Booking CTAs, primary commit states).
- **Accent Hover (`#8E3319`)**: Darkened iron terracotta for active/hover states on solid accent buttons.
- **Accent Paper Display (`#C9522F`)**: Lighter terracotta optimized strictly for large display typography directly against `#F7F4EF` paper. Never use this for body text.
- **Accent Wash (`#F6E7E1`)**: Faint terracotta wash for active list-item selection, date-range highlights, and reservation state indicators.
- **Editorial Link / Info (`#1F4E5F`)**: Deep mineral teal. Reserved for textual hyperlinks, interactive room amenity details, and editorial footnotes. Never use as a solid button fill.
- **Link Hover (`#163B48`)**: Deepened teal for link hover transitions.
- **Hairline Border (`#DED7CA`)**: The universal dividing line. Creates strict structural partitions.
- **Form Border (`#B9AE9C`)**: Mid-contrast border for unselected input fields, checkboxes, and interactive controls.
- **Functional Semantics**: Success (`#3F6B4A`), Warning (`#8A6A1F`), Danger (`#8C2F22`).

### Contrast & Application Rules
1. **The Inviolable Ink Rule**: Pure card surface white (`#FFFDFA`) is the *only* permitted text color atop solid terracotta (`#A63D22`). Never layer `#1F1B16` ink atop `#A63D22`.
2. **Teal Isolation**: Deep teal (`#1F4E5F`) is restricted strictly to inline text anchors, breadcrumb chains, and utility links. It must never appear as a container background or filled button.
3. **No Dark Mode**: The platform functions exclusively in broad daylight paper stock. Dark-mode inversions compromise the literary print aesthetic and are strictly barred.

## Typography

Typography delivers the core editorial voice. It pairs an expressive, variable serif with a compact, structural sans-serif and a mechanical typewriter monospaced accent.

### Font Roles
- **Display & Headlines**: Fraunces. Rendered primarily in regular weight (`400`) at grand scales to maintain bookish elegance. Large display titles evoke travel essay titles and heritage mastheads.
- **Body, UI & Meta**: Archivo Narrow. High legibility, neutral posture, and dense horizontal economy. Used across room specifications, itinerary details, longform essays, and form labels.
- **Technical & Booking Codes**: Courier Prime (or IBM Plex Mono). Used for reservation confirmation strings, room coordinates, baggage limits, flight connections, and tabular receipts.

### Typesetting Rules
- **Column Measure**: All longform editorial body blocks must have a strict horizontal max-width of `68ch`. Never allow editorial text to span full-width grid layouts.
- **Tabular Figures**: Every numeric string—including prices, dates, occupancy rates, and dimensional room meters—must be rendered using OpenType tabular figures (`font-variant-numeric: tabular-nums`).
- **Uppercase Metadata**: Category slugs, room tier labels, and section dividers are set in `label-caps`: uppercase, `12px` (0.75rem), semi-bold (`600`), tracked with `0.08em` letterspacing.

## Layout & Spacing

The layout is built around a rigorous 12-column broadsheet grid on desktop, shifting to a 6-column grid on tablet, and a single or 2-column stacked layout on mobile devices.

### Grid System & Outer Margins
- **Desktop (1200px and up)**: 12-column layout. Margin: `3rem` (`48px`). Gutter: `1.5rem` (`24px`). Max-width is capped at `1440px` centered to evoke a bound volume.
- **Tablet (768px – 1199px)**: 6-column layout. Margin: `2rem` (`32px`). Gutter: `1.25rem` (`20px`).
- **Mobile (Below 768px)**: 2-column layout. Margin: `1rem` (`16px`). Gutter: `1rem` (`16px`). Side drawers and booking bottom sheets touch outer edges seamlessly.

### Spacing Cadence
- Content elements align along an explicit baseline rhythmic scale based on units of `0.25rem` (`4px`).
- Sections are cleanly separated by structural rules (`1px` hairline) rather than deep negative space gaps.
- Editorial card content uses dense internal padding (`space-md` or `space-lg`), maximizing information density akin to classifieds or archival cards.

## Elevation & Depth

This system operates in strict, authentic two-dimensional space. Modern digital skeuomorphism, glassmorphism, blurs, and floating dropshadows are prohibited.

### Surface Tiers & Hairline Structure
Depth is established exclusively via **tonal stacking** and **1px ruled hairlines**:
- **Layer 0 (Base)**: `#F7F4EF` (Bone paper canvas).
- **Layer 1 (Card / Column Surface)**: `#FFFDFA` (Warm white inset).
- **Layer 2 (Inset Wells)**: `#EFEAE1` (Substrate panels for price summaries, amenities tables, and metadata keys).
- **Layer 3 (Ink Contrast Panels)**: `#1F1B16` (Deep ink foundation for footers, editorial pull-quotes, and navigation anchor bars).

### Delimitation
- Cards, table rows, navigation bands, and image frames must be segregated via a crisp, solid `1px` border using `#DED7CA`.
- Cards never cast shadows to indicate elevation. On hover, interactive cards do not rise on the Z-axis; instead, their hairline border transitions from `#DED7CA` to `#1F1B16`, or their background shifts faintly toward `#FFFDFA`.

### Modals & Drawers Exception
The sole permissible shadow token across the entire design system is reserved for floating dropdown menus, context popovers, and transactional booking side-sheets:
- `box-shadow: 0 8px 24px rgba(31, 27, 22, 0.10);`
- Modals must preserve the `1px solid #DED7CA` hairline outer boundary alongside this ambient wash.

## Shapes

The design system is fundamentally angular and architectonic. 

### Corner Radii Guidelines
- **Containers, Cards & Images**: Absolute `0px` radius. Every property gallery image, editorial quote container, dialogue card, and content divider must have razor-sharp 90-degree corners.
- **Pill Shapes Prohibited**: Pill-shaped badges, rounded chip filters, and organic oval containers are strictly forbidden.
- **Micro-Elements**: Buttons, input fields, and small typographic indicator tags are permitted an imperceptible maximum corner radius of `2px` to subtly soften sharp ink edges without creating visible roundness.

## Components

### Buttons
- **Primary CTA**: Solid fill in Deep Terracotta (`#A63D22`). Typography is Archivo SemiBold, uppercase (`12px`, letter spacing `0.08em`). Padding: `12px 24px`. Border-radius: `2px`. Text color: `#FFFDFA` strictly. Hover state: `#8E3319`.
- **Secondary Action**: Background `#FFFDFA`, `1px` border in `#B9AE9C`. Text color `#1F1B16`. Hover state: background `#F7F4EF`, border `#1F1B16`.
- **Tertiary / Editorial Link**: Transparent fill. Text color `#1F4E5F` (Teal), single underline in `rgba(31,78,95,0.4)` with an offset of `4px`. Hover state: `#163B48` with full-opacity underline.

### Input Fields & Selectors
- **Surface**: `#FFFDFA` background framed by a `1px` border in `#B9AE9C`. Corner radius: `2px`.
- **Typography**: Value text is Archivo Narrow `15px` `#1F1B16`.
- **States**: Focus changes the border to a definitive `1px solid #1F1B16` with zero glowing halos or diffuse focus rings. Placeholder text: `#918878`.
- **Floating/Affiliated Labels**: Positioned directly above the field in `label-caps` (`12px`, tracked `0.08em`, `#6B635A`).

### Hotel & Room Cards
- **Geometry**: Sharp corners (`0px`). Surface: `#FFFDFA`. Boundary: `1px solid #DED7CA`.
- **Imagery**: Flush with the top and side card borders or separated with a clean `1px` inner frame. Aspect ratios strictly locked to classic medium format (`4:3` or `3:2`). No rounded image corners.
- **Pricing & Rates**: Tabular figures in `18px` Fraunces or Archivo SemiBold. Always display nights, currency, and inclusive taxes clearly using Courier Prime or small Archivo caps.

### Chips & Metadata Tags
- **Appearance**: Rectangular (`0px` or `2px` maximum radius). Never pill-shaped.
- **Tokens**: Background `#EFEAE1`, text `#6B635A`, border `1px solid #DED7CA`. 
- **Active State**: Background `#1F1B16`, text `#FFFDFA`, border `#1F1B16`.

### Checkboxes & Radios
- **Checkboxes**: `16px` square, `0px` radius, `1px solid #B9AE9C`. Checked state: `#1F1B16` background with a crisp `#FFFDFA` checkmark glyph.
- **Radio Buttons**: `16px` true circle, `1px solid #B9AE9C`. Checked state: `#FFFDFA` background with an inset `#1F1B16` solid dot (`8px`).

### Editorial Tables & Itineraries
- **Structure**: Alternating rows using `#FFFDFA` and `#EFEAE1`.
- **Dividers**: Horizontal `1px` hairline rules using `#DED7CA`. No vertical interior cell borders.
- **Cell Content**: Monospaced tabular numbers for dates, times, and inventory counts. Clean left-aligned copy for descriptions.