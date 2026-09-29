<script setup lang="ts">
type Variant = 'primary' | 'secondary' | 'ghost'
type Size = 'sm' | 'md' | 'lg'

/**
 * Variants map to COMPLETE static class strings. Tailwind v4 scans source text for
 * class names, so `bg-${color}-600` would never be generated. See D35.
 */
const variantClasses: Record<Variant, string> = {
  // D20: the only text colour permitted on a terracotta fill is surface, never ink.
  primary: 'bg-accent text-surface hover:bg-accent-hover',
  secondary: 'bg-surface text-fg border border-rule hover:border-fg',
  ghost: 'bg-transparent text-link hover:underline underline-offset-4',
}

const sizeClasses: Record<Size, string> = {
  sm: 'h-10 px-4 text-sm',
  md: 'h-12 px-6 text-sm',
  lg: 'h-14 px-8 text-label uppercase',
}

const { variant = 'primary', size = 'md', to, type = 'button', disabled = false, loading = false }
  = defineProps<{
    variant?: Variant
    size?: Size
    to?: string
    type?: 'button' | 'submit'
    disabled?: boolean
    loading?: boolean
  }>()

defineEmits<{ click: [event: MouseEvent] }>()

const classes = computed(() =>
  [
    'inline-flex items-center justify-center gap-2 rounded-sm font-medium',
    'transition-colors duration-150 ease-editorial',
    'disabled:pointer-events-none disabled:opacity-60',
    variantClasses[variant],
    sizeClasses[size],
  ].join(' '),
)
</script>

<template>
  <NuxtLink
    v-if="to"
    :to="to"
    :class="classes"
    :aria-disabled="disabled || undefined"
  >
    <slot />
  </NuxtLink>

  <button
    v-else
    :type="type"
    :class="classes"
    :disabled="disabled || loading"
    :aria-busy="loading || undefined"
    @click="$emit('click', $event)"
  >
    <BaseSpinner
      v-if="loading"
      class="h-4 w-4"
    />
    <slot />
  </button>
</template>
