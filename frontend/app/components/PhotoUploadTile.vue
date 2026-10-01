<script setup lang="ts">
/**
 * One photo in the wizard's upload grid: the preview, its per-file state, and the two
 * controls that act on it.
 *
 * It renders state rather than owning it — `usePhotoUploads` holds the entry, so a retry
 * or a remove is visible everywhere the same file appears without any of them holding a
 * copy.
 *
 * Every state is carried by text as well as by colour: `Uploading 42%`, `Uploaded`, and
 * `Upload failed` say the same thing the bar and the tints say, so the grid reads without
 * colour vision. That is also why the bar is a real `role="progressbar"` with
 * `aria-valuenow` rather than a div with a background width.
 */
import type { PhotoUploadItem } from '~/composables/usePhotoUploads'

const props = defineProps<{ photo: PhotoUploadItem }>()

const emit = defineEmits<{ retry: [id: number], remove: [id: number] }>()

const { t } = useI18n()

const inFlight = computed(() => props.photo.status === 'queued' || props.photo.status === 'uploading')

/**
 * `Queued` and `Uploading` are announced apart on purpose: `queued` means the sign
 * request has not come back yet, so there is genuinely no percentage to report.
 */
const statusLabel = computed(() => {
  if (props.photo.status === 'queued') return t('host.photoQueued')
  if (props.photo.status === 'uploading') return t('host.photoUploading', { percent: props.photo.progress })
  if (props.photo.status === 'done') return t('host.photoDone')
  return t('host.photoFailed')
})

const problemLabel = computed(() => {
  if (props.photo.problem === 'sign-failed') return t('host.photoProblemSign')
  if (props.photo.problem === 'network') return t('host.photoProblemNetwork')
  return t('host.photoProblemRejected')
})
</script>

<template>
  <li class="border-rule bg-surface flex flex-col rounded-none border">
    <div class="border-rule relative border-b">
      <img
        :src="photo.previewUrl"
        :alt="photo.name"
        width="400"
        height="300"
        class="aspect-[4/3] w-full object-cover"
      >
      <!--
        The wash sits under the thumbnail, not over the name below it, so a failure is
        visible in the grid without covering the control that retries it.
      -->
      <p
        v-if="photo.status === 'failed'"
        class="bg-danger-wash text-danger text-label absolute inset-x-0 bottom-0 border-t border-danger px-2 py-1 uppercase"
      >
        {{ $t('host.photoFailed') }}
      </p>
    </div>

    <div class="flex flex-1 flex-col gap-2 p-2">
      <p class="min-w-0 truncate text-sm">
        {{ photo.name }}
      </p>

      <div
        v-if="photo.status === 'uploading'"
        class="bg-surface-alt h-1 w-full"
        role="progressbar"
        :aria-label="$t('host.photoProgressLabel', { name: photo.name })"
        aria-valuemin="0"
        aria-valuemax="100"
        :aria-valuenow="photo.progress"
        :aria-valuetext="statusLabel"
      >
        <div
          class="bg-accent h-full transition-[width] duration-150 ease-editorial"
          :style="{ width: `${photo.progress}%` }"
        />
      </div>

      <p
        class="text-fg-muted text-sm"
        :class="photo.status === 'failed' ? 'text-danger' : ''"
        :role="photo.status === 'failed' ? 'alert' : 'status'"
      >
        {{ statusLabel }}
      </p>

      <p
        v-if="photo.status === 'failed'"
        class="text-fg-muted text-sm"
      >
        {{ problemLabel }}
        <span
          v-if="photo.detail"
          class="block"
        >{{ photo.detail }}</span>
      </p>

      <div class="mt-auto flex items-center justify-between gap-2 pt-1">
        <BaseButton
          v-if="photo.status === 'failed'"
          variant="secondary"
          size="sm"
          :aria-label="$t('host.retryPhoto', { name: photo.name })"
          @click="emit('retry', photo.id)"
        >
          {{ $t('common.retry') }}
        </BaseButton>
        <span v-else />

        <button
          type="button"
          class="text-danger shrink-0 px-2 py-1 text-sm underline-offset-4 hover:underline disabled:pointer-events-none disabled:opacity-60"
          :aria-label="$t('host.removePhoto', { name: photo.name })"
          :disabled="inFlight"
          @click="emit('remove', photo.id)"
        >
          {{ $t('common.remove') }}
        </button>
      </div>
    </div>
  </li>
</template>
