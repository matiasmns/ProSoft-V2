import type { CropPayload } from './electroforesis'

export type LocalFractionKey = 'albumina' | 'alfa_1' | 'alfa_2' | 'beta_1' | 'beta_2' | 'gamma'

export type LocalFractionResult = {
  start: number
  end: number
  peak_index: number
  area: number
  percentage: number
  concentration: number | null
}

export type LocalProcessorResult = {
  axis: 'x' | 'y'
  image_size: { width: number; height: number }
  crop_used: { left: number; top: number; width: number; height: number }
  profile_length: number
  detected_peaks: number
  peaks: number[]
  valleys: number[]
  total_area: number
  profile: Array<{ x: number; y: number }>
  fractions: Record<LocalFractionKey, LocalFractionResult>
  warning: string | null
}

type FractionWindow = {
  key: LocalFractionKey
  start: number
  end: number
}

const FRACTION_WINDOWS: FractionWindow[] = [
  { key: 'albumina', start: 0.0, end: 0.35 },
  { key: 'alfa_1', start: 0.35, end: 0.45 },
  { key: 'alfa_2', start: 0.45, end: 0.56 },
  { key: 'beta_1', start: 0.56, end: 0.68 },
  { key: 'beta_2', start: 0.68, end: 0.78 },
  { key: 'gamma', start: 0.78, end: 1.0 },
]
const SIGNAL_FLOOR = 0.008
const VALLEY_OFFSETS = [0.018, 0, 0.018, -0.055, 0.055]
const REFERENCE_GUIDED_TARGETS = [0.5780, 0.0375, 0.1218, 0.0577, 0.0584, 0.1466]
const ALBUMIN_GUARD_MIN_PERCENT = 45
const ALBUMIN_GUARD_MAX_FIRST_BOUNDARY_RATIO = 0.42
const ALBUMIN_GUARD_GAMMA_DOMINANCE_RATIO = 1.25

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function getCanvasContext(width: number, height: number) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })

  if (!context) {
    throw new Error('No se pudo inicializar el canvas para procesar la imagen.')
  }

  return { canvas, context }
}

function buildCropRect(crop: CropPayload | null | undefined, width: number, height: number) {
  const left = clamp(Math.floor(crop?.izquierda ?? 0), 0, Math.max(0, width - 1))
  const top = clamp(Math.floor(crop?.arriba ?? 0), 0, Math.max(0, height - 1))

  const requestedWidth = Math.floor(crop?.ancho ?? width)
  const requestedHeight = Math.floor(crop?.alto ?? height)

  const cropWidth = clamp(requestedWidth > 0 ? requestedWidth : width - left, 1, Math.max(1, width - left))
  const cropHeight = clamp(requestedHeight > 0 ? requestedHeight : height - top, 1, Math.max(1, height - top))

  return {
    left,
    top,
    width: cropWidth,
    height: cropHeight,
  }
}

function movingAverage(values: number[], windowSize: number) {
  if (values.length === 0) return values

  const radius = Math.floor(windowSize / 2)
  return values.map((_, index) => {
    let total = 0
    let count = 0

    for (let cursor = index - radius; cursor <= index + radius; cursor += 1) {
      if (cursor < 0 || cursor >= values.length) continue
      total += values[cursor]
      count += 1
    }

    return count > 0 ? total / count : values[index]
  })
}

function trapezoidArea(values: number[], start: number, end: number) {
  let total = 0
  for (let index = start; index < end; index += 1) {
    total += (values[index] + values[index + 1]) / 2
  }
  return total
}

function findValley(values: number[], from: number, to: number) {
  if (to <= from) return from
  if (to - from <= 2) return clamp(Math.round((from + to) / 2), 0, Math.max(0, values.length - 1))

  let valleyIndex = from + 1
  let valleyValue = Number.POSITIVE_INFINITY

  for (let index = from + 1; index < to; index += 1) {
    if (values[index] < valleyValue) {
      valleyValue = values[index]
      valleyIndex = index
    }
  }

  return valleyIndex
}

function applyValleyOffsets(values: number[], valleys: number[], peaks: number[]) {
  const sampleCount = values.length
  const maxIndex = Math.max(sampleCount - 1, 0)
  return valleys.map((valley, index) => {
    let offset = VALLEY_OFFSETS[index] ?? 0
    if (index === valleys.length - 1 && offset > 0) {
      const albuminPeak = values[peaks[0]] ?? 0
      const gammaPeak = values[peaks[peaks.length - 1]] ?? 0
      if (gammaPeak >= albuminPeak * 1.2) {
        offset = 0
      }
    }
    const lower = peaks[index] + 1
    const upper = peaks[index + 1] - 1
    if (upper < lower) return valley
    const shifted = valley + Math.round(offset * maxIndex)
    return clamp(shifted, lower, upper)
  })
}

function buildAreaTargetValleys(values: number[], targets: number[]) {
  const maxIndex = Math.max(values.length - 1, 0)
  if (maxIndex <= 0) return []

  const totalArea = trapezoidArea(values, 0, maxIndex)
  if (totalArea <= 0) return []

  const minGap = Math.max(2, Math.floor(values.length / 150))
  const valleys: number[] = []
  let accumulatedTarget = 0
  let previousIndex = 0

  for (let index = 0; index < targets.length - 1; index += 1) {
    accumulatedTarget += Math.max(0, targets[index])
    const targetArea = totalArea * accumulatedTarget
    let runningArea = 0
    let targetIndex = maxIndex

    for (let cursor = 0; cursor < maxIndex; cursor += 1) {
      const segmentArea = (values[cursor] + values[cursor + 1]) / 2
      const nextArea = runningArea + segmentArea

      if (nextArea >= targetArea) {
        const fractionWithinSegment = segmentArea > 0 ? (targetArea - runningArea) / segmentArea : 0
        targetIndex = clamp(cursor + Math.round(clamp(fractionWithinSegment, 0, 1)), 0, maxIndex)
        break
      }

      runningArea = nextArea
    }

    const remainingBoundaries = targets.length - 1 - index
    const minAllowed = previousIndex + minGap
    const maxAllowed = maxIndex - remainingBoundaries * minGap
    targetIndex = clamp(targetIndex, minAllowed, maxAllowed)
    valleys.push(targetIndex)
    previousIndex = targetIndex
  }

  return valleys
}

function applyAlbuminInternalSplitGuard(values: number[], peaks: number[], valleys: number[]) {
  if (valleys.length !== REFERENCE_GUIDED_TARGETS.length - 1 || peaks.length < REFERENCE_GUIDED_TARGETS.length) {
    return { valleys, warning: '' }
  }

  const maxIndex = Math.max(values.length - 1, 1)
  const totalArea = trapezoidArea(values, 0, maxIndex)
  if (totalArea <= 0) return { valleys, warning: '' }

  const albuminArea = trapezoidArea(values, 0, valleys[0])
  const albuminPercent = (albuminArea / totalArea) * 100
  const firstBoundaryRatio = valleys[0] / maxIndex

  if (albuminPercent >= ALBUMIN_GUARD_MIN_PERCENT) return { valleys, warning: '' }
  if (firstBoundaryRatio >= ALBUMIN_GUARD_MAX_FIRST_BOUNDARY_RATIO) return { valleys, warning: '' }

  const albuminPeak = values[peaks[0]] ?? 0
  const gammaPeak = values[peaks[peaks.length - 1]] ?? 0
  if (gammaPeak >= albuminPeak * ALBUMIN_GUARD_GAMMA_DOMINANCE_RATIO) return { valleys, warning: '' }

  const guidedValleys = buildAreaTargetValleys(values, REFERENCE_GUIDED_TARGETS)
  if (guidedValleys.length !== valleys.length || guidedValleys[0] <= valleys[0]) {
    return { valleys, warning: '' }
  }

  return {
    valleys: guidedValleys,
    warning: 'Se aplico correccion automatica por probable valle interno de albumina; validar separadores con revision manual o PDF.',
  }
}

function detectLocalMaxima(values: number[]) {
  const minHeight = 0.05
  const minDistance = Math.max(8, Math.floor(values.length / 18))
  const candidates: number[] = []

  for (let index = 1; index < values.length - 1; index += 1) {
    if (values[index] >= values[index - 1] && values[index] > values[index + 1] && values[index] >= minHeight) {
      candidates.push(index)
    }
  }

  candidates.sort((left, right) => values[right] - values[left])

  const selected: number[] = []
  for (const candidate of candidates) {
    if (selected.every(peak => Math.abs(peak - candidate) >= minDistance)) {
      selected.push(candidate)
    }
  }

  return selected.sort((left, right) => left - right)
}

function downsampleProfile(values: number[], maxPoints = 240) {
  if (values.length <= maxPoints) {
    return values.map((value, index) => ({
      x: values.length === 1 ? 0 : index / (values.length - 1),
      y: value,
    }))
  }

  // Use max-pooling so narrow peaks are preserved instead of skipped.
  const binSize = values.length / maxPoints
  const sampled: Array<{ x: number; y: number }> = []

  for (let point = 0; point < maxPoints; point += 1) {
    const start = Math.floor(point * binSize)
    const end = Math.min(Math.ceil((point + 1) * binSize), values.length - 1)
    let maxVal = values[start]
    let maxIdx = start
    for (let i = start + 1; i <= end; i += 1) {
      if (values[i] > maxVal) {
        maxVal = values[i]
        maxIdx = i
      }
    }
    sampled.push({
      x: maxIdx / (values.length - 1),
      y: maxVal,
    })
  }

  return sampled
}

function buildAxisProfile(data: Uint8ClampedArray, width: number, height: number, axis: 'x' | 'y') {
  const length = axis === 'x' ? width : height
  const crossLength = axis === 'x' ? height : width
  const profile = new Array<number>(length).fill(0)

  for (let primary = 0; primary < length; primary += 1) {
    let total = 0

    for (let secondary = 0; secondary < crossLength; secondary += 1) {
      const x = axis === 'x' ? primary : secondary
      const y = axis === 'x' ? secondary : primary
      const pixelIndex = (y * width + x) * 4
      const red = data[pixelIndex]
      const green = data[pixelIndex + 1]
      const blue = data[pixelIndex + 2]
      const grayscale = 0.2126 * red + 0.7152 * green + 0.0722 * blue
      total += 255 - grayscale
    }

    profile[primary] = total / crossLength
  }

  return profile
}

async function loadImageData(imageUrl: string) {
  const response = await fetch(imageUrl)
  if (!response.ok) {
    throw new Error('No se pudo leer la imagen para procesarla.')
  }

  const blob = await response.blob()
  const bitmap = await createImageBitmap(blob)
  const { context } = getCanvasContext(bitmap.width, bitmap.height)
  context.drawImage(bitmap, 0, 0)
  const imageData = context.getImageData(0, 0, bitmap.width, bitmap.height)
  bitmap.close()

  return {
    width: imageData.width,
    height: imageData.height,
    data: imageData.data,
  }
}

export async function processElectrophoresisImage(input: {
  imageUrl: string
  crop?: CropPayload | null
  totalConcentration?: number | null
}): Promise<LocalProcessorResult> {
  const image = await loadImageData(input.imageUrl)
  const cropRect = buildCropRect(input.crop, image.width, image.height)
  const fullCanvas = getCanvasContext(image.width, image.height)
  const fullImageData = fullCanvas.context.createImageData(image.width, image.height)
  fullImageData.data.set(image.data)
  fullCanvas.context.putImageData(fullImageData, 0, 0)

  const croppedData = fullCanvas.context.getImageData(cropRect.left, cropRect.top, cropRect.width, cropRect.height)
  const axis: 'x' | 'y' = cropRect.width >= cropRect.height ? 'x' : 'y'
  const rawProfile = buildAxisProfile(croppedData.data, cropRect.width, cropRect.height, axis)

  const minValue = Math.min(...rawProfile)
  const correctedProfile = rawProfile.map(value => Math.max(0, value - minValue))

  let smoothWindow = Math.max(5, Math.floor(correctedProfile.length / 30))
  if (smoothWindow % 2 === 0) smoothWindow += 1

  const smoothedProfile = movingAverage(correctedProfile, smoothWindow)
  const maxValue = Math.max(...smoothedProfile, 1)
  let normalizedProfile = smoothedProfile.map(value => value / maxValue)
  if (SIGNAL_FLOOR > 0) {
    const flooredProfile = normalizedProfile.map(value => Math.max(0, value - SIGNAL_FLOOR))
    const flooredMaxValue = Math.max(...flooredProfile, 0.000001)
    normalizedProfile = flooredProfile.map(value => value / flooredMaxValue)
  }

  const detectedPeaks = detectLocalMaxima(normalizedProfile)
  const peakIndexes = FRACTION_WINDOWS.map(window => {
    const start = clamp(Math.floor(window.start * (normalizedProfile.length - 1)), 0, normalizedProfile.length - 1)
    const end = clamp(Math.floor(window.end * (normalizedProfile.length - 1)), start, normalizedProfile.length - 1)

    // Prefer a real detected peak within this window; fall back to the highest point
    const windowPeaks = detectedPeaks.filter(p => p >= start && p <= end)
    if (windowPeaks.length > 0) {
      return windowPeaks.reduce((best, p) => normalizedProfile[p] > normalizedProfile[best] ? p : best)
    }

    let peakIndex = start
    let peakValue = -1

    for (let index = start; index <= end; index += 1) {
      if (normalizedProfile[index] > peakValue) {
        peakValue = normalizedProfile[index]
        peakIndex = index
      }
    }

    return peakIndex
  })

  // Ensure peaks are strictly increasing to avoid zero-area fractions on short profiles
  for (let index = 1; index < peakIndexes.length; index += 1) {
    if (peakIndexes[index] <= peakIndexes[index - 1]) {
      peakIndexes[index] = Math.min(peakIndexes[index - 1] + 1, normalizedProfile.length - 1)
    }
  }

  const detectedValleys = peakIndexes.slice(0, -1).map((peakIndex, index) => (
    findValley(normalizedProfile, peakIndex, peakIndexes[index + 1])
  ))
  const shiftedValleys = applyValleyOffsets(normalizedProfile, detectedValleys, peakIndexes)
  const albuminGuard = applyAlbuminInternalSplitGuard(normalizedProfile, peakIndexes, shiftedValleys)
  const valleys = albuminGuard.valleys

  const fractionBounds = FRACTION_WINDOWS.map((window, index) => ({
    key: window.key,
    start: index === 0 ? 0 : valleys[index - 1],
    end: index === FRACTION_WINDOWS.length - 1 ? normalizedProfile.length - 1 : valleys[index],
    peak: peakIndexes[index],
  }))

  const totalArea = trapezoidArea(normalizedProfile, 0, normalizedProfile.length - 1)
  if (totalArea <= 0) {
    throw new Error('La imagen no contiene una senal util para el procesamiento preliminar.')
  }

  const fractions = fractionBounds.reduce<Record<LocalFractionKey, LocalFractionResult>>((accumulator, bound) => {
    const area = trapezoidArea(normalizedProfile, bound.start, bound.end)
    const percentage = Number(((area / totalArea) * 100).toFixed(2))
    const concentration = input.totalConcentration != null
      ? Number(((percentage * input.totalConcentration) / 100).toFixed(2))
      : null

    accumulator[bound.key] = {
      start: bound.start,
      end: bound.end,
      peak_index: bound.peak,
      area: Number(area.toFixed(4)),
      percentage,
      concentration,
    }

    return accumulator
  }, {
    albumina: { start: 0, end: 0, peak_index: 0, area: 0, percentage: 0, concentration: null },
    alfa_1: { start: 0, end: 0, peak_index: 0, area: 0, percentage: 0, concentration: null },
    alfa_2: { start: 0, end: 0, peak_index: 0, area: 0, percentage: 0, concentration: null },
    beta_1: { start: 0, end: 0, peak_index: 0, area: 0, percentage: 0, concentration: null },
    beta_2: { start: 0, end: 0, peak_index: 0, area: 0, percentage: 0, concentration: null },
    gamma: { start: 0, end: 0, peak_index: 0, area: 0, percentage: 0, concentration: null },
  })

  const warningParts: string[] = []
  if (cropRect.width < 40 || cropRect.height < 40) {
    warningParts.push('El recorte es pequeno y puede degradar la estimacion.')
  }
  if (detectedPeaks.length < 4) {
    warningParts.push('Se detectaron pocos picos; revisar imagen y parametros.')
  }
  if (albuminGuard.warning) {
    warningParts.push(albuminGuard.warning)
  }

  return {
    axis,
    image_size: { width: image.width, height: image.height },
    crop_used: cropRect,
    profile_length: normalizedProfile.length,
    detected_peaks: detectedPeaks.length,
    peaks: peakIndexes,
    valleys,
    total_area: Number(totalArea.toFixed(4)),
    profile: downsampleProfile(normalizedProfile),
    fractions,
    warning: warningParts.length > 0 ? warningParts.join(' ') : null,
  }
}
