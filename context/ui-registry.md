# UI Registry

Every component built, one row each. Add a row when the component is created.

## Base components (T2)

| Component | Path | Type | Ticket | Status |
|---|---|---|---|---|
| `BaseAlert` | `app/components/BaseAlert.vue` | display | T2 | built |
| `BaseBadge` | `app/components/BaseBadge.vue` | display | T2 | built |
| `BaseButton` | `app/components/BaseButton.vue` | form | T2 | built |
| `BaseCard` | `app/components/BaseCard.vue` | display | T2 | built |
| `BaseEmptyState` | `app/components/BaseEmptyState.vue` | display | T2 | built |
| `BaseInput` | `app/components/BaseInput.vue` | form | T2 | built |
| `BaseModal` | `app/components/BaseModal.vue` | display | T2 | built |
| `BasePagination` | `app/components/BasePagination.vue` | form | T2 | built |
| `BaseSelect` | `app/components/BaseSelect.vue` | form | T2 | built |
| `BaseSkeleton` | `app/components/BaseSkeleton.vue` | display | T2 | built |
| `BaseSpinner` | `app/components/BaseSpinner.vue` | display | T2 | built |

## Layouts (T2)

| Component | Path | Type | Ticket | Status |
|---|---|---|---|---|
| `default` | `app/layouts/default.vue` | layout | T2 | built |
| `dashboard` | `app/layouts/dashboard.vue` | layout | T2 | built |

## Domain components

| Component | Path | Type | Ticket | Status |
|---|---|---|---|---|
| `HotelCard` | `app/components/HotelCard.vue` | display | T4 | built |
| `SearchWidget` | `app/components/SearchWidget.vue` | form | T4 | built |
| `GuestsStepper` | `app/components/GuestsStepper.vue` | form | T5 | built |
| `HotelFilterDrawer` | `app/components/HotelFilterDrawer.vue` | form | T5 | built |
| `HotelFilters` | `app/components/HotelFilters.vue` | form | T5 | built |
| `PriceRangeSlider` | `app/components/PriceRangeSlider.vue` | form | T5 | built |
| `HotelBookingPanel` | `app/components/HotelBookingPanel.vue` | display | T6 | built |
| `HotelGallery` | `app/components/HotelGallery.vue` | display | T6 | built |
| `HotelLightbox` | `app/components/HotelLightbox.vue` | display | T6 | built |
| `HotelLocation` | `app/components/HotelLocation.vue` | display | T6 | built |
| `RatingBreakdown` | `app/components/RatingBreakdown.vue` | display | T6 | built |
| `ReviewCard` | `app/components/ReviewCard.vue` | display | T6 | built |
| `RoomCard` | `app/components/RoomCard.vue` | display | T6 | built |
| `OrderSummary` | `app/components/OrderSummary.vue` | display | T7 | built |
| `BookingStatusBadge` | `app/components/BookingStatusBadge.vue` | display | T8 | built |
| `OAuthButtons` | `app/components/OAuthButtons.vue` | form | T9 | built |
| `StatCard` | `app/components/StatCard.vue` | display | T10 | built |
| `HotelStatusBadge` | `app/components/HotelStatusBadge.vue` | display | T10 | built |
| `HotelRatingSummary` | `app/components/HotelRatingSummary.vue` | display | T17c | built |
| `FavoriteToggle` | `app/components/FavoriteToggle.vue` | form | T19 | built |

Remaining, as their tickets build them — Phase 2 domain components and Phase 5 additions.

**Type** — `display` (presentational) / `form` (input handling) / `layout` (page shell).
**Status** — `planned` / `built` / `verified`.

## Rules this registry enforces

- One component per file. Two components in one file is a split, not a style choice
  (`context/code-standards.md`, "One component per file").
- A component that needs a sub-piece gets its own file, registered here.
- Add the row **in the same commit** that creates the component.
- Extract at the **second** duplicate, not the third (D14). When a component here is
  duplicated for a third time, it should already have been lifted out.
