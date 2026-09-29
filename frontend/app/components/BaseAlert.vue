<script setup lang="ts">
/**
 * Status alert. `role="status"` for polite messages, `role="alert"` for errors, so a
 * screen reader announces an async failure without stealing focus.
 */
type Tone = 'info' | 'success' | 'warning' | 'danger'

const toneClasses: Record<Tone, string> = {
  info: 'bg-info-wash text-info border-info',
  success: 'bg-success-wash text-success border-success',
  warning: 'bg-warning-wash text-warning border-warning',
  danger: 'bg-danger-wash text-danger border-danger',
}

const props = withDefaults(defineProps<{ tone?: Tone, title?: string }>(), { tone: 'info' })

const role = computed(() => (props.tone === 'danger' ? 'alert' : 'status'))
</script>

<template>
  <div
    :role="role"
    class="flex flex-col gap-1 rounded-sm border px-4 py-3 text-sm"
    :class="toneClasses[tone]"
  >
    <strong
      v-if="title"
      class="font-medium"
    >{{ title }}</strong>
    <p><slot /></p>
  </div>
</template>
