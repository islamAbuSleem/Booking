<script setup lang="ts">
/**
 * Pagination. Status must never be conveyed by colour alone, so the current page
 * carries `aria-current="page"` and weight changes alongside the fill.
 */
const props = defineProps<{ page: number, pageSize: number, total: number }>()
const emit = defineEmits<{ 'update:page': [page: number] }>()

const totalPages = computed(() => Math.max(1, Math.ceil(props.total / props.pageSize)))

const pages = computed(() => {
  const count = totalPages.value
  const current = props.page
  if (count <= 7) return Array.from({ length: count }, (_, i) => i + 1)
  const window: number[] = [1]
  const start = Math.max(2, current - 1)
  const end = Math.min(count - 1, current + 1)
  if (start > 2) window.push(-1)
  for (let i = start; i <= end; i++) window.push(i)
  if (end < count - 1) window.push(-1)
  window.push(count)
  return window
})

const go = (page: number): void => {
  if (page < 1 || page > totalPages.value || page === props.page) return
  emit('update:page', page)
}
</script>

<template>
  <nav
    v-if="totalPages > 1"
    class="flex items-center gap-1"
    :aria-label="$t('common.pagination')"
  >
    <button
      type="button"
      class="border-rule text-fg-muted hover:border-fg h-10 rounded-sm border px-3 text-sm disabled:opacity-40"
      :disabled="page === 1"
      @click="go(page - 1)"
    >
      {{ $t('common.back') }}
    </button>

    <template
      v-for="(entry, index) in pages"
      :key="`${entry}-${index}`"
    >
      <span
        v-if="entry === -1"
        class="text-fg-subtle px-2"
        aria-hidden="true"
      >…</span>
      <button
        v-else
        type="button"
        class="tabular h-10 w-10 rounded-sm border text-sm"
        :class="
          entry === page
            ? 'border-accent bg-accent text-surface'
            : 'border-rule text-fg-muted hover:border-fg'
        "
        :aria-current="entry === page ? 'page' : undefined"
        :aria-label="$t('common.pageNumber', { entry })"
        @click="go(entry)"
      >
        {{ entry }}
      </button>
    </template>

    <button
      type="button"
      class="border-rule text-fg-muted hover:border-fg h-10 rounded-sm border px-3 text-sm disabled:opacity-40"
      :disabled="page === totalPages"
      @click="go(page + 1)"
    >
      {{ $t('common.next') }}
    </button>
  </nav>
</template>
