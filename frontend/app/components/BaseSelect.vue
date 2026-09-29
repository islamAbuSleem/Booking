<script setup lang="ts">
const model = defineModel<string>()

defineProps<{
  id: string
  label: string
  options: { value: string, label: string }[]
  error?: string
  disabled?: boolean
}>()

const errorId = computed(() => `${useId()}-error`)
</script>

<template>
  <div class="flex flex-col gap-2">
    <label
      :for="id"
      class="text-fg-muted text-label uppercase"
    >{{ label }}</label>

    <select
      :id="id"
      v-model="model"
      :disabled="disabled"
      :aria-invalid="error ? true : undefined"
      :aria-describedby="error ? errorId : undefined"
      class="text-fg border-rule-strong bg-surface h-12 w-full rounded-sm border px-3 text-sm transition-colors duration-150 focus:border-fg focus:outline-none"
      :class="error ? 'border-danger' : ''"
    >
      <option
        v-for="option in options"
        :key="option.value"
        :value="option.value"
      >
        {{ option.label }}
      </option>
    </select>

    <p
      v-if="error"
      :id="errorId"
      class="text-danger text-sm"
      role="alert"
    >
      {{ error }}
    </p>
  </div>
</template>
