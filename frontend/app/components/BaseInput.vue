<script setup lang="ts">
const model = defineModel<string | number | null>()

const props = withDefaults(
  defineProps<{
    id: string
    label: string
    type?: 'text' | 'email' | 'tel' | 'password' | 'date' | 'number' | 'search'
    placeholder?: string
    error?: string
    hint?: string
    required?: boolean
    disabled?: boolean
    autocomplete?: string
  }>(),
  { type: 'text', required: false, disabled: false },
)

const errorId = computed(() => `${useId()}-error`)
const hintId = computed(() => `${useId()}-hint`)

/**
 * The error wins: the template shows one or the other, so a screen reader is told about
 * exactly the text that is on screen. A hint with no error still has to be announced, and
 * `aria-describedby` is the only thing that does that.
 */
const describedBy = computed(() => {
  const ids: string[] = []
  if (props.error) ids.push(errorId.value)
  else if (props.hint) ids.push(hintId.value)
  return ids.length ? ids.join(' ') : undefined
})
</script>

<template>
  <div class="flex flex-col gap-2">
    <label
      :for="id"
      class="text-fg-muted text-label uppercase"
    >
      {{ label }}
      <span
        v-if="required"
        aria-hidden="true"
      >*</span>
    </label>

    <input
      :id="id"
      v-model="model"
      :type="type"
      :placeholder="placeholder"
      :required="required"
      :disabled="disabled"
      :autocomplete="autocomplete"
      :aria-invalid="error ? true : undefined"
      :aria-describedby="describedBy"
      class="text-fg placeholder:text-fg-subtle border-rule-strong bg-surface h-12 w-full rounded-sm border px-3 text-sm transition-colors duration-150 focus:border-fg focus:outline-none"
      :class="error ? 'border-danger' : ''"
    >

    <p
      v-if="error"
      :id="errorId"
      class="text-danger text-sm"
      role="alert"
    >
      {{ error }}
    </p>
    <p
      v-else-if="hint"
      :id="hintId"
      class="text-fg-subtle text-sm"
    >
      {{ hint }}
    </p>
  </div>
</template>
