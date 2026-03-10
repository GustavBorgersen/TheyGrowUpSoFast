/**
 * faceAlign.ts — Core face alignment algorithm
 *
 * IMPORTANT memory rules:
 * - Caller passes a shared canvas (useRef) — never create canvas inside this fn
 * - Call ctx.clearRect() before each frame
 * - Wrap TF detection in tf.tidy()
 * - Downscale on a separate small canvas; discard after detection
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FaceApi = any

// Tuned constants — do not make configurable
const TARGET_IPD = 220
const CANVAS_W = 1080
const CANVAS_H = 1350
const EYE_X = 540          // CANVAS_W / 2
const EYE_Y = 513          // CANVAS_H * 0.38
const MATCH_THRESHOLD = 0.6
const DETECT_MAX_W = 800

export type AlignSuccess = {
  skipped: false
  canvas: HTMLCanvasElement
  descriptor: Float32Array
  profileScore: number
}

import type { SkipReason } from '@/types'

export type AlignSkipped = {
  skipped: true
  reason: SkipReason
}

export type AlignResult = AlignSuccess | AlignSkipped

function avg(points: { x: number; y: number }[]): { x: number; y: number } {
  return {
    x: points.reduce((s, p) => s + p.x, 0) / points.length,
    y: points.reduce((s, p) => s + p.y, 0) / points.length,
  }
}

function euclidean(a: Float32Array, b: Float32Array): number {
  let sum = 0
  for (let i = 0; i < a.length; i++) sum += (a[i] - b[i]) ** 2
  return Math.sqrt(sum)
}

/**
 * Detect and align a single face from an HTMLImageElement.
 *
 * @param faceApi  — the dynamically-imported face-api module
 * @param img      — source image
 * @param canvas   — shared output canvas (1080×1350, passed in from caller)
 * @param reference — descriptor from the first photo; null for the first photo
 * @param maxProfileScore — max allowed profile score (from project settings)
 */
export async function detectAndAlign(
  faceApi: FaceApi,
  img: HTMLImageElement | HTMLCanvasElement,
  canvas: HTMLCanvasElement,
  reference: Float32Array | null,
  maxProfileScore: number
): Promise<AlignResult> {
  // 1. Downscale input to max DETECT_MAX_W for speed + memory
  const srcW = img instanceof HTMLImageElement ? (img.naturalWidth || img.width) : img.width
  const srcH = img instanceof HTMLImageElement ? (img.naturalHeight || img.height) : img.height
  const scale = Math.min(1, DETECT_MAX_W / Math.max(srcW, srcH, 1))
  const dw = Math.round(srcW * scale)
  const dh = Math.round(srcH * scale)

  const detectCanvas = document.createElement('canvas')
  detectCanvas.width = dw
  detectCanvas.height = dh
  const detectCtx = detectCanvas.getContext('2d')
  if (!detectCtx) throw new Error('Could not get detect canvas context')
  detectCtx.drawImage(img, 0, 0, dw, dh)

  // 2. Detect face with landmarks + descriptor
  // Note: tf.tidy() is synchronous — cannot await inside it. face-api manages its own tensors.
  const detection = await faceApi
    .detectSingleFace(detectCanvas)
    .withFaceLandmarks()
    .withFaceDescriptor()

  if (!detection) {
    return { skipped: true, reason: 'no_face' }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const det = detection as any
  const descriptor = new Float32Array(det.descriptor)
  const positions = det.landmarks.positions

  // 3. Eye centers (landmarks 36–41 = left eye, 42–47 = right eye), nose tip = 30
  const leftEye = avg(positions.slice(36, 42))
  const rightEye = avg(positions.slice(42, 48))
  const noseTip = positions[30]

  // 4. Profile score — use scaled coordinates (nose tip and eye centers are all on the detect canvas)
  const leftDistScaled = Math.abs(noseTip.x - leftEye.x)
  const rightDistScaled = Math.abs(rightEye.x - noseTip.x)
  const profileScore = Math.abs(leftDistScaled - rightDistScaled) / Math.max(leftDistScaled, rightDistScaled, 1)

  if (profileScore > maxProfileScore) {
    return { skipped: true, reason: 'profile_angle' }
  }

  // 5. Identity check (skip on first photo — it becomes the reference)
  if (reference !== null) {
    const dist = euclidean(descriptor, reference)
    if (dist > MATCH_THRESHOLD) {
      return { skipped: true, reason: 'identity_mismatch' }
    }
  }

  // 6. Compute transform (using original image coordinates — scale back from detect canvas)
  const le = { x: leftEye.x / scale, y: leftEye.y / scale }
  const re = { x: rightEye.x / scale, y: rightEye.y / scale }

  const angle = Math.atan2(re.y - le.y, re.x - le.x)
  const currentIPD = Math.hypot(re.x - le.x, re.y - le.y)
  const scaleF = TARGET_IPD / currentIPD
  const eyeMid = { x: (le.x + re.x) / 2, y: (le.y + re.y) / 2 }

  // 7. Draw onto shared canvas
  canvas.width = CANVAS_W
  canvas.height = CANVAS_H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not get output canvas context')

  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H)
  ctx.fillStyle = 'black'
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)

  ctx.save()
  ctx.translate(EYE_X, EYE_Y)
  ctx.rotate(-angle)
  ctx.scale(scaleF, scaleF)
  ctx.translate(-eyeMid.x, -eyeMid.y)
  ctx.drawImage(img, 0, 0)
  ctx.restore()

  return { skipped: false, canvas, descriptor, profileScore }
}
