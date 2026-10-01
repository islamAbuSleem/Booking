/**
 * T21 — photo uploads for the listing wizard's photo step.
 *
 * One signed round trip per file, then the bytes go **straight to Cloudinary**. The
 * browser never proxies the image through our API and never through `apiFetch`: that
 * client is same-origin, attaches our session cookie, and unwraps our envelope, none of
 * which apply to a third-party host. So the Cloudinary POST is a raw `XMLHttpRequest`
 * (`fetch` reports no upload progress) reading Cloudinary's own response shape.
 *
 * **Per-file state, not one flag.** A photo that fails must not lose the six that
 * succeeded, so `status` lives on each entry and one click on retry re-runs that entry
 * alone. A retry always asks for a **fresh signature**: a Cloudinary signature is bound
 * to its timestamp and expires after an hour, which is one of the failures retry exists
 * to clear.
 *
 * Nothing is attached to a listing here. The wizard creates the hotel in T22, so there is
 * no `hotelId` to attach to yet — the Cloudinary result is staged on the entry and T22
 * hands it to `attachUpload`. That is also why a removed photo cannot be deleted from
 * Cloudinary: the API's `DELETE /uploads/:publicId` looks the image row up first, and an
 * unstaged upload has no row, so the call would 404. See the report.
 *
 * Page-local `ref`, not `useState`: an abandoned listing's uploads must not follow the
 * host into the next one.
 */
import { fetchUploadSign } from '~/utils/api'
import type { ApiUploadSign } from '~/utils/api'

export type PhotoUploadStatus = 'queued' | 'uploading' | 'done' | 'failed'

/** Why an attempt stopped. Each one points the host at a different next move. */
export type PhotoUploadProblem = 'sign-failed' | 'network' | 'rejected'

/**
 * What Cloudinary reports about the stored asset. Width, height and aspect are optional
 * because Cloudinary omits them for a resource type that has none; the attach DTO takes
 * them as optional too and the API fills its own defaults, so the client does not
 * duplicate those literals.
 */
export interface StagedUpload {
  url: string
  publicId: string
  width?: number
  height?: number
  aspect?: string
}

export interface PhotoUploadItem {
  /** Monotonic, never reused: the `:key` for the rendered tile. */
  id: number
  name: string
  status: PhotoUploadStatus
  /** 0-100, determinate, only meaningful while `status === 'uploading'`. */
  progress: number
  problem: PhotoUploadProblem | null
  /** The third party's own wording for a rejection, when it gave any. */
  detail: string
  /** Cloudinary's `secure_url` once done, the blob URL until then. */
  previewUrl: string
  /** The blob URL, or `null` once it has been revoked and `previewUrl` points at Cloudinary. */
  objectUrl: string | null
  /** Kept for retry. Vue does not proxy a `File`, so a reactive entry holds the real handle. */
  file: File
  uploaded: StagedUpload | null
}

/**
 * Cloudinary's upload response. A third-party shape, not our contract — declared here so
 * the wire is readable, and narrowed from `unknown` before anything trusts it. `apiKey`
 * in `UploadSign` is the only one of these the API owns; the rest is Cloudinary's.
 */
interface CloudinaryUploadResult {
  public_id: string
  secure_url: string
  width?: number
  height?: number
  aspect_ratio?: number
}

/** A failure we can explain. `detail` is the third party's own words, shown verbatim. */
class PhotoUploadError extends Error {
  readonly problem: PhotoUploadProblem
  readonly detail: string

  constructor(problem: PhotoUploadProblem, detail: string) {
    super(detail === '' ? problem : detail)
    this.name = 'PhotoUploadError'
    this.problem = problem
    this.detail = detail
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function parseJson(text: string): unknown {
  try {
    const parsed: unknown = JSON.parse(text)
    return parsed
  }
  catch {
    return null
  }
}

/** Cloudinary reports a failure as `{ error: { message } }`. */
function errorMessage(payload: unknown): string {
  if (!isRecord(payload) || !isRecord(payload.error)) return ''
  return typeof payload.error.message === 'string' ? payload.error.message : ''
}

/**
 * Narrows the parsed body to Cloudinary's own shape. `public_id` and `secure_url` are
 * what make the upload real — without them there is nothing to stage — so they gate the
 * read and everything else is opportunistic.
 */
function readUploadResult(payload: unknown): CloudinaryUploadResult | null {
  if (!isRecord(payload)) return null
  const { public_id: publicId, secure_url: secureUrl } = payload
  if (typeof publicId !== 'string' || typeof secureUrl !== 'string') return null

  return {
    public_id: publicId,
    secure_url: secureUrl,
    width: typeof payload.width === 'number' ? payload.width : undefined,
    height: typeof payload.height === 'number' ? payload.height : undefined,
    aspect_ratio: typeof payload.aspect_ratio === 'number' ? payload.aspect_ratio : undefined,
  }
}

/** Maps Cloudinary's wire names onto the staged shape the attach contract consumes. */
function toStagedUpload(result: CloudinaryUploadResult): StagedUpload {
  const { width, height } = result
  // `aspect_ratio` arrives as a float (1.5); the attach contract's vocabulary is `3:2`,
  // so the ratio is reduced from the pixel dimensions rather than reformatted.
  const aspect = width !== undefined && height !== undefined ? reduceRatio(width, height) : undefined

  return { url: result.secure_url, publicId: result.public_id, width, height, aspect }
}

function greatestCommonDivisor(a: number, b: number): number {
  let left = Math.abs(Math.trunc(a))
  let right = Math.abs(Math.trunc(b))
  while (right !== 0) {
    const next = left % right
    left = right
    right = next
  }
  return left
}

function reduceRatio(width: number, height: number): string {
  const divisor = greatestCommonDivisor(width, height)
  // A zero dimension has no meaningful ratio; 1:1 is a square, not a lie.
  if (divisor === 0) return '1:1'
  return `${width / divisor}:${height / divisor}`
}

/**
 * Every field Cloudinary verifies must be inside the signature. `folder` is one of them:
 * it is part of the signed set, not a free-text hint, and sending it unsigned is an
 * `Invalid Signature` rejection rather than a silently unscoped upload.
 */
function signedFormData(file: File, sign: ApiUploadSign): FormData {
  const form = new FormData()
  form.append('file', file)
  form.append('api_key', sign.apiKey)
  form.append('timestamp', String(sign.timestamp))
  form.append('signature', sign.signature)
  form.append('folder', sign.folder)
  return form
}

function postToCloudinary(
  file: File,
  sign: ApiUploadSign,
  onProgress: (percent: number) => void,
): Promise<StagedUpload> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest()
    request.open('POST', `https://api.cloudinary.com/v1_1/${sign.cloudName}/image/upload`)

    request.upload.addEventListener('progress', (event: ProgressEvent) => {
      if (!event.lengthComputable || event.total === 0) return
      // 100% here means the bytes are on the wire, not that Cloudinary has processed
      // them, so the bar stops at 99 and only `load` marks the photo done.
      onProgress(Math.min(99, Math.round((event.loaded / event.total) * 100)))
    })

    request.addEventListener('load', () => {
      const payload: unknown = parseJson(request.responseText)
      if (request.status < 200 || request.status >= 300) {
        reject(new PhotoUploadError('rejected', errorMessage(payload)))
        return
      }
      const result = readUploadResult(payload)
      if (!result) {
        reject(new PhotoUploadError('rejected', ''))
        return
      }
      resolve(toStagedUpload(result))
    })

    // Fires for DNS, TLS and offline alike: nothing came back to explain it.
    request.addEventListener('error', () => reject(new PhotoUploadError('network', '')))
    request.addEventListener('abort', () => reject(new PhotoUploadError('network', '')))

    request.send(signedFormData(file, sign))
  })
}

export function usePhotoUploads() {
  const uploads = ref<PhotoUploadItem[]>([])
  let nextId = 0

  /**
   * Once the bytes have a home on Cloudinary, the blob URL is dead weight: the tile
   * shows `secure_url` from here on, and leaving the object URL alive would pin the whole
   * file in memory for the rest of the page's life. Idempotent, so the unmount sweep
   * below can run over every entry without having to know which ones are still holding.
   */
  function releaseObjectUrl(item: PhotoUploadItem): void {
    if (item.objectUrl === null) return
    URL.revokeObjectURL(item.objectUrl)
    item.objectUrl = null
  }

  async function runUpload(item: PhotoUploadItem): Promise<void> {
    item.status = 'queued'
    item.progress = 0
    item.problem = null
    item.detail = ''

    let sign: ApiUploadSign
    try {
      // A fresh signature per attempt, which is what makes retry clear a stale timestamp.
      sign = await fetchUploadSign()
    }
    catch {
      item.progress = 0
      item.status = 'failed'
      item.problem = 'sign-failed'
      item.detail = ''
      return
    }

    item.status = 'uploading'

    try {
      const upload = await postToCloudinary(item.file, sign, (percent) => {
        item.progress = percent
      })
      item.uploaded = upload
      item.progress = 100
      item.status = 'done'
      item.previewUrl = upload.url
      releaseObjectUrl(item)
    }
    catch (error: unknown) {
      item.progress = 0
      item.status = 'failed'
      if (error instanceof PhotoUploadError) {
        item.problem = error.problem
        item.detail = error.detail
      }
      else {
        item.problem = 'sign-failed'
        item.detail = ''
      }
    }
  }

  /**
   * A host picking ten photos fires ten sign requests at once rather than ten serial
   * round trips — the per-file chain is sign-then-upload either way, so queueing them
   * would only add latency.
   */
  function addFiles(files: File[]): void {
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue
      nextId += 1
      const objectUrl = URL.createObjectURL(file)
      const item: PhotoUploadItem = {
        id: nextId,
        name: file.name,
        status: 'queued',
        progress: 0,
        problem: null,
        detail: '',
        previewUrl: objectUrl,
        objectUrl,
        file,
        uploaded: null,
      }
      uploads.value.push(item)
      void runUpload(item)
    }
  }

  function retry(id: number): void {
    const item = uploads.value.find(entry => entry.id === id)
    // A photo already in flight has nothing to retry, and a second attempt would race
    // the first for the same slot.
    if (!item || item.status === 'uploading' || item.status === 'queued') return
    void runUpload(item)
  }

  function remove(id: number): void {
    const index = uploads.value.findIndex(entry => entry.id === id)
    if (index < 0) return
    const [removed] = uploads.value.splice(index, 1)
    if (removed) releaseObjectUrl(removed)
  }

  onUnmounted(() => {
    for (const item of uploads.value) releaseObjectUrl(item)
  })

  return { uploads, addFiles, retry, remove }
}
