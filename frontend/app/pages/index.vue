<script setup lang="ts">
useSeoMeta({
  title: () => $t('common.brand'),
  description: () => $t('hotel.freeCancellation', { time: '24 hours' }),
  ogType: 'website',
})
</script>

<template>
  <div class="mx-auto max-w-[1280px] px-6 py-24">
    <p class="text-accent-bright text-label uppercase">
      Curated lodgings
    </p>
    <h1 class="font-display mt-3 text-[3.5rem] leading-[0.95] tracking-[-0.02em]">
      {{ $t('common.brand') }}
    </h1>
    <p class="prose-70 text-fg-muted mt-5 text-lg">
      {{ $t('common.brandSince') }}
    </p>

    <div class="mt-10 flex flex-wrap gap-4">
      <BaseButton variant="primary">
        {{ $t('search.submit') }}
      </BaseButton>
      <BaseButton variant="secondary">
        {{ $t('nav.listYourProperty') }}
      </BaseButton>
      <BaseBadge status="accent">
        {{ $t('status.pending') }}
      </BaseBadge>
      <BaseBadge status="success">
        {{ $t('status.confirmed') }}
      </BaseBadge>
    </div>

    <div class="mt-16 grid gap-6 md:grid-cols-3">
      <BaseCard
        v-for="n in 3"
        :key="n"
        interactive
      >
        <BaseSkeleton
          :rows="4"
          class="border-b"
        />
        <div class="flex flex-col gap-2 p-4">
          <p class="text-fg-muted text-label uppercase">
            Lisbon, Portugal
          </p>
          <h2 class="font-display text-lg">
            The Larkspur Hotel
          </h2>
          <p class="tabular text-fg text-lg font-semibold">
            $214 <span class="text-fg-subtle text-sm font-normal">{{ $t('hotel.perNight') }}</span>
          </p>
        </div>
      </BaseCard>
    </div>

    <div class="mt-16 grid gap-6 lg:grid-cols-2">
      <BaseAlert
        tone="info"
        :title="$t('state.error')"
      >
        {{ $t('state.errorHint') }}
      </BaseAlert>
      <BaseEmptyState
        :title="$t('state.noResults')"
        :hint="$t('state.noResultsHint')"
      />
    </div>

    <div class="mt-16">
      <BasePagination
        :page="2"
        :page-size="12"
        :total="264"
        @update:page="() => {}"
      />
    </div>
  </div>
</template>
