<script setup lang="ts">
/**
 * Favourite heart. It owns its state through `useFavorites` rather than taking a boolean,
 * so the same hotel shown as a card and as a page header agrees without either parent
 * holding anything.
 *
 * `hotelName` is not decoration. A results grid renders a dozen of these, and
 * "Save to favorites" twelve times over is not a usable screen-reader list — the name
 * makes each button's accessible name distinct.
 *
 * The pressed state is carried four ways, because a fill is not a signal: `aria-pressed`
 * for assistive tech, outline vs solid glyph and ink vs accent for the eye, and the wash
 * background behind it. Any one of the three visible cues would do alone; the pressed
 * state is the one place where dropping to a single cue would be a WCAG 1.4.1 failure.
 */
const props = defineProps<{
  /** The hotel's **uuid**, not the slug — the favourite row is keyed by uuid. */
  hotelId: string
  hotelName: string
}>()

const { entryFor, toggle } = useFavorites()

const { t } = useI18n()

const uid = useId()
const problemId = `${uid}-problem`

/** Read through a computed on the id: a route swap to another hotel re-reads. */
const entry = computed(() => entryFor(props.hotelId))

const label = computed(() =>
  t(entry.value.pressed ? 'favorites.removeLabel' : 'favorites.saveLabel', {
    name: props.hotelName,
  }),
)

const problem = computed(() =>
  entry.value.problem === null
    ? null
    : t(
        entry.value.problem === 'signin-required'
          ? 'favorites.signInPrompt'
          : 'favorites.saveFailed',
        { name: props.hotelName },
      ),
)

function onClick(): void {
  void toggle(props.hotelId)
}
</script>

<template>
  <div class="flex flex-col items-end gap-1.5">
    <button
      type="button"
      class="border-rule bg-surface text-fg-muted hover:border-fg hover:text-fg flex h-11 w-11 shrink-0 items-center justify-center rounded-sm border transition-colors duration-150 disabled:opacity-60"
      :class="entry.pressed ? 'border-accent bg-accent-wash text-accent' : ''"
      :aria-pressed="entry.pressed"
      :aria-label="label"
      :aria-busy="entry.pending || undefined"
      :aria-describedby="entry.problem ? problemId : undefined"
      :disabled="entry.pending"
      @click.stop="onClick"
    >
      <svg
        viewBox="0 0 16 16"
        width="16"
        height="16"
        aria-hidden="true"
        focusable="false"
      >
        <path
          d="M8 13.5S2 9.5 2 5.9C2 3.9 3.6 2.5 5.5 2.5c1.2 0 2 .5 2.5 1.4.5-.9 1.3-1.4 2.5-1.4 1.9 0 3.5 1.4 3.5 3.4 0 3.6-6 7.6-6 7.6Z"
          :fill="entry.pressed ? 'currentColor' : 'none'"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linejoin="round"
        />
      </svg>
    </button>

    <p
      v-if="problem"
      :id="problemId"
      class="border-rule bg-surface text-fg-muted max-w-[220px] rounded-sm border p-2 text-sm"
      aria-live="polite"
    >
      {{ problem }}
      <NuxtLink
        v-if="entry.problem === 'signin-required'"
        to="/login"
        class="text-link underline-offset-4 hover:underline"
      >{{ $t('favorites.signIn') }}</NuxtLink>
    </p>
  </div>
</template>
