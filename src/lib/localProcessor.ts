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
  profile_signal: number[]
  profile: Array<{ x: number; y: number }>
  fractions: Record<LocalFractionKey, LocalFractionResult>
  warning: string | null
}

type FractionWindow = {
  key: LocalFractionKey
  start: number
  end: number
}

const FRACTION_KEYS: LocalFractionKey[] = ['albumina', 'alfa_1', 'alfa_2', 'beta_1', 'beta_2', 'gamma']
const FRACTION_WINDOWS: FractionWindow[] = [
  { key: 'albumina', start: 0.0, end: 0.35 },
  { key: 'alfa_1', start: 0.35, end: 0.45 },
  { key: 'alfa_2', start: 0.45, end: 0.56 },
  { key: 'beta_1', start: 0.56, end: 0.68 },
  { key: 'beta_2', start: 0.68, end: 0.78 },
  { key: 'gamma', start: 0.78, end: 1.0 },
]
const PROJECTION_TOP_FRACTION = 0.38
const MIN_SIGNAL_DYNAMIC_RANGE = 9
const HIGH_VALLEY_WARNING_LEVEL = 0.34
const GLOBAL_BASELINE_PERCENTILE = 0.05
const RESIDUAL_BASELINE_PERCENTILE = 0.02
const LOCAL_BASELINE_MIN_CORRELATION = 0.90
const LOCAL_BASELINE_MAX_PEAK_SHIFT_RATIO = 0.065
const BASELINE_WINDOW_DIVISOR = 18
const BASELINE_WINDOW_MIN = 9
const SMOOTHING_SIGMA_DIVISOR = 220
const SMOOTHING_SIGMA_MIN = 1.25
const PEAK_MIN_HEIGHT = 0.025
const PEAK_DISTANCE_DIVISOR = 20
const PEAK_DISTANCE_MIN = 8
const EXPECTED_PEAK_WARNING_THRESHOLD = 4
const CROP_WARNING_MIN_WIDTH = 80
const CROP_WARNING_MIN_HEIGHT = 35
const PROFILE_DOWNSAMPLE_POINTS = 700
const ALBUMIN_TARGET_POSITION_IN_WINDOW = 0.60
const BOUNDARY_SHIFT_LIMIT_RATIO = 0.08
const GAUSSIAN_WIDTH_MIN_RATIO = 0.026
const GAUSSIAN_WIDTH_SCALES = [0.7, 1.0, 1.35]
const GAUSSIAN_FIT_ITERATIONS = 1200
const GAUSSIAN_FIT_EPSILON = 1e-9
const REFERENCE_VALLEY_SNAP_WINDOW_RATIO = 0.04
const REFERENCE_MAX_FRACTION_ERROR_AFTER_SNAP = 1.25
const REFERENCE_MAX_TOTAL_ERROR_INCREASE_AFTER_SNAP = 1.5

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function clampRatio(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function roundTo(value: number, digits: number) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
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

  return {
    left,
    top,
    width: clamp(requestedWidth > 0 ? requestedWidth : width - left, 1, Math.max(1, width - left)),
    height: clamp(requestedHeight > 0 ? requestedHeight : height - top, 1, Math.max(1, height - top)),
  }
}

function percentile(values: number[], ratio: number) {
  if (values.length === 0) return 0
  const sorted = [...values].sort((left, right) => left - right)
  const index = clamp(Math.round((sorted.length - 1) * ratio), 0, sorted.length - 1)
  return sorted[index]
}

function gaussianKernel(sigma: number) {
  const radius = Math.max(1, Math.ceil(sigma * 3))
  const kernel: number[] = []
  let total = 0

  for (let offset = -radius; offset <= radius; offset += 1) {
    const value = Math.exp(-(offset * offset) / (2 * sigma * sigma))
    kernel.push(value)
    total += value
  }

  return kernel.map(value => value / total)
}

function gaussianSmooth(values: number[], sigma: number) {
  const kernel = gaussianKernel(sigma)
  const radius = Math.floor(kernel.length / 2)

  return values.map((_, index) => {
    let total = 0
    for (let cursor = -radius; cursor <= radius; cursor += 1) {
      const sourceIndex = clamp(index + cursor, 0, values.length - 1)
      total += values[sourceIndex] * kernel[cursor + radius]
    }
    return total
  })
}

function minimumFilter(values: number[], windowSize: number) {
  const radius = Math.floor(windowSize / 2)

  return values.map((_, index) => {
    let currentMin = Number.POSITIVE_INFINITY
    for (let cursor = -radius; cursor <= radius; cursor += 1) {
      const sourceIndex = clamp(index + cursor, 0, values.length - 1)
      currentMin = Math.min(currentMin, values[sourceIndex])
    }
    return currentMin
  })
}

function standardDeviation(values: number[]) {
  if (values.length === 0) return 0
  const mean = values.reduce((total, value) => total + value, 0) / values.length
  const variance = values.reduce((total, value) => total + ((value - mean) ** 2), 0) / values.length
  return Math.sqrt(variance)
}

function pearsonCorrelation(left: number[], right: number[]) {
  if (left.length !== right.length || left.length === 0) return NaN

  const leftMean = left.reduce((total, value) => total + value, 0) / left.length
  const rightMean = right.reduce((total, value) => total + value, 0) / right.length

  let numerator = 0
  let leftDenominator = 0
  let rightDenominator = 0

  for (let index = 0; index < left.length; index += 1) {
    const leftDelta = left[index] - leftMean
    const rightDelta = right[index] - rightMean
    numerator += leftDelta * rightDelta
    leftDenominator += leftDelta * leftDelta
    rightDenominator += rightDelta * rightDelta
  }

  const denominator = Math.sqrt(leftDenominator * rightDenominator)
  if (denominator <= 0) return NaN
  return numerator / denominator
}

function trapezoidArea(values: number[], start: number, end: number) {
  if (end <= start) return 0

  let total = 0
  for (let index = start; index < end; index += 1) {
    total += (values[index] + values[index + 1]) / 2
  }
  return total
}

function buildRobustProjection(data: Uint8ClampedArray, width: number, height: number, axis: 'x' | 'y') {
  const length = axis === 'x' ? width : height
  const crossLength = axis === 'x' ? height : width
  const topCount = Math.max(1, Math.round(crossLength * PROJECTION_TOP_FRACTION))
  const profile = new Array<number>(length).fill(0)

  for (let primary = 0; primary < length; primary += 1) {
    const darknessValues: number[] = []

    for (let secondary = 0; secondary < crossLength; secondary += 1) {
      const x = axis === 'x' ? primary : secondary
      const y = axis === 'x' ? secondary : primary
      const pixelIndex = (y * width + x) * 4
      const red = data[pixelIndex]
      const green = data[pixelIndex + 1]
      const blue = data[pixelIndex + 2]
      const grayscale = 0.2126 * red + 0.7152 * green + 0.0722 * blue
      darknessValues.push(255 - grayscale)
    }

    darknessValues.sort((left, right) => left - right)
    const topValues = darknessValues.slice(-topCount)
    profile[primary] = topValues.reduce((total, value) => total + value, 0) / topValues.length
  }

  return profile
}

function finalizeNormalizedSignal(corrected: number[]) {
  const sigma = Math.max(SMOOTHING_SIGMA_MIN, corrected.length / SMOOTHING_SIGMA_DIVISOR)
  const smoothed = gaussianSmooth(corrected, sigma)
  const residualBaseline = percentile(smoothed, RESIDUAL_BASELINE_PERCENTILE)
  const cleaned = smoothed.map(value => Math.max(0, value - residualBaseline))
  const maxValue = Math.max(...cleaned, 0)

  if (maxValue <= 0) {
    throw new Error('La imagen no contiene una senal util para el procesamiento.')
  }

  const normalized = cleaned.map(value => value / maxValue)
  normalized[0] = 0
  normalized[normalized.length - 1] = 0
  return normalized
}

function normalizeWithGlobalBaseline(values: number[]) {
  const baseline = percentile(values, GLOBAL_BASELINE_PERCENTILE)
  return finalizeNormalizedSignal(values.map(value => Math.max(0, value - baseline)))
}

function normalizeWithLocalBaseline(values: number[]) {
  let window = Math.max(BASELINE_WINDOW_MIN, Math.floor(values.length / BASELINE_WINDOW_DIVISOR))
  if (window % 2 === 0) window += 1

  const rollingMin = minimumFilter(values, window)
  const baseline = gaussianSmooth(rollingMin, window / 2)
  const corrected = values.map((value, index) => Math.max(0, value - baseline[index]))
  return finalizeNormalizedSignal(corrected)
}

function findPeakIndex(values: number[], start: number, end: number) {
  const safeStart = clamp(start, 0, Math.max(0, values.length - 1))
  const safeEnd = clamp(end, safeStart, Math.max(0, values.length - 1))
  let peakIndex = safeStart
  let peakValue = Number.NEGATIVE_INFINITY

  for (let index = safeStart; index <= safeEnd; index += 1) {
    if (values[index] > peakValue) {
      peakValue = values[index]
      peakIndex = index
    }
  }

  return peakIndex
}

function localBaselinePreservesShape(rawProfile: number[], normalizedProfile: number[]) {
  const maxIndex = Math.max(rawProfile.length - 1, 1)
  const rawPeakIndex = findPeakIndex(rawProfile, 0, rawProfile.length - 1)
  const normalizedPeakIndex = findPeakIndex(normalizedProfile, 0, normalizedProfile.length - 1)
  const maxPeakShift = Math.max(3, Math.round(maxIndex * LOCAL_BASELINE_MAX_PEAK_SHIFT_RATIO))

  if (Math.abs(rawPeakIndex - normalizedPeakIndex) > maxPeakShift) {
    return false
  }

  const rawStd = standardDeviation(rawProfile)
  const normalizedStd = standardDeviation(normalizedProfile)
  if (rawStd <= 0 || normalizedStd <= 0) {
    return false
  }

  const correlation = pearsonCorrelation(rawProfile, normalizedProfile)
  return Number.isFinite(correlation) && correlation >= LOCAL_BASELINE_MIN_CORRELATION
}

function normalizeSignal(rawProfile: number[]) {
  if (rawProfile.length < 4) {
    throw new Error('La imagen recortada es demasiado chica para extraer un densitograma.')
  }

  const dynamicRange = percentile(rawProfile, 0.98) - percentile(rawProfile, 0.02)
  if (dynamicRange < MIN_SIGNAL_DYNAMIC_RANGE) {
    throw new Error('La imagen no contiene suficiente contraste para extraer una senal util.')
  }

  const globalNormalized = normalizeWithGlobalBaseline(rawProfile)
  const localNormalized = normalizeWithLocalBaseline(rawProfile)

  if (localBaselinePreservesShape(rawProfile, localNormalized)) {
    return localNormalized
  }

  return globalNormalized
}

function detectLocalMaxima(values: number[]) {
  const minDistance = Math.max(PEAK_DISTANCE_MIN, Math.floor(values.length / PEAK_DISTANCE_DIVISOR))
  const candidates: number[] = []

  for (let index = 1; index < values.length - 1; index += 1) {
    if (values[index] >= values[index - 1] && values[index] > values[index + 1] && values[index] >= PEAK_MIN_HEIGHT) {
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

function minGapFor(sampleCount: number) {
  const baseGap = sampleCount >= 180 ? 4 : sampleCount >= 90 ? 3 : 2
  const maxIndex = Math.max(0, sampleCount - 1)
  const feasibleGap = Math.max(1, Math.floor(maxIndex / Math.max(1, FRACTION_KEYS.length)))
  return Math.min(baseGap, feasibleGap)
}

function normalizeBoundaryIndices(indices: number[], sampleCount: number) {
  const maxIndex = Math.max(0, sampleCount - 1)
  if (maxIndex === 0) return new Array(FRACTION_KEYS.length + 1).fill(0)

  const minGap = minGapFor(sampleCount)
  const normalized = [...indices]
  normalized[0] = 0
  normalized[normalized.length - 1] = maxIndex

  for (let index = 0; index < normalized.length; index += 1) {
    const minAllowed = index === 0 ? 0 : normalized[index - 1] + minGap
    const maxAllowed = maxIndex - ((normalized.length - 1 - index) * minGap)
    normalized[index] = clamp(normalized[index], minAllowed, maxAllowed)
  }

  for (let index = normalized.length - 2; index >= 0; index -= 1) {
    const maxAllowed = normalized[index + 1] - minGap
    const minAllowed = index === 0 ? 0 : normalized[index - 1] + minGap
    normalized[index] = clamp(normalized[index], minAllowed, maxAllowed)
  }

  normalized[0] = 0
  normalized[normalized.length - 1] = maxIndex
  return normalized
}

function buildAreaPercentages(values: number[], boundaries: number[]) {
  const totalArea = trapezoidArea(values, boundaries[0], boundaries[boundaries.length - 1])
  const safeTotalArea = totalArea > 0 ? totalArea : 1

  return FRACTION_KEYS.map((_, index) => (
    (trapezoidArea(values, boundaries[index], boundaries[index + 1]) / safeTotalArea) * 100
  ))
}

function measureTargetError(values: number[], boundaries: number[], targetPercentages: number[]) {
  const percentages = buildAreaPercentages(values, boundaries)
  const errors = percentages.map((percentage, index) => Math.abs(percentage - targetPercentages[index]))

  return {
    totalError: errors.reduce((total, error) => total + error, 0),
    maxError: Math.max(...errors),
  }
}

function findNearestReferenceValley(values: number[], targetIndex: number, minAllowed: number, maxAllowed: number) {
  const maxIndex = Math.max(0, values.length - 1)
  const safeMin = clamp(minAllowed, 0, maxIndex)
  const safeMax = clamp(maxAllowed, safeMin, maxIndex)
  const safeTarget = clamp(targetIndex, safeMin, safeMax)
  const radius = Math.max(2, Math.round(maxIndex * REFERENCE_VALLEY_SNAP_WINDOW_RATIO))
  const start = Math.max(safeMin, safeTarget - radius)
  const end = Math.min(safeMax, safeTarget + radius)

  let bestIndex = safeTarget
  let bestScore = Number.POSITIVE_INFINITY
  let foundLocalMinimum = false

  for (let index = start; index <= end; index += 1) {
    const previous = values[index - 1] ?? values[index]
    const current = values[index]
    const next = values[index + 1] ?? values[index]
    const isLocalMinimum = current <= previous && current <= next

    if (!isLocalMinimum && foundLocalMinimum) continue

    const distancePenalty = (Math.abs(index - safeTarget) / Math.max(radius, 1)) * 0.025
    const score = current + distancePenalty

    if (isLocalMinimum && !foundLocalMinimum) {
      foundLocalMinimum = true
      bestScore = Number.POSITIVE_INFINITY
    }

    if (score < bestScore) {
      bestScore = score
      bestIndex = index
    }
  }

  return bestIndex
}

function estimateProfileShiftRatio(values: number[]) {
  const maxIndex = Math.max(values.length - 1, 1)
  const albuminWindow = FRACTION_WINDOWS[0]
  const searchEndRatio = FRACTION_WINDOWS[Math.min(1, FRACTION_WINDOWS.length - 1)].end
  const observedPeak = findPeakIndex(values, 0, Math.round(searchEndRatio * maxIndex))
  const observedPeakRatio = observedPeak / maxIndex
  const expectedPeakRatio = albuminWindow.start + ((albuminWindow.end - albuminWindow.start) * ALBUMIN_TARGET_POSITION_IN_WINDOW)
  return clampRatio(observedPeakRatio - expectedPeakRatio, -BOUNDARY_SHIFT_LIMIT_RATIO, BOUNDARY_SHIFT_LIMIT_RATIO)
}

function fitFractionTargetPercentages(values: number[]) {
  const xAxis = values.map((_, index) => (
    values.length <= 1 ? 0 : index / (values.length - 1)
  ))
  const profileShiftRatio = estimateProfileShiftRatio(values)
  const basisColumns: number[][] = []
  const basisOwners: number[] = []
  const basisAreas: number[] = []

  FRACTION_WINDOWS.forEach((window, fractionIndex) => {
    const center = clampRatio(((window.start + window.end) / 2) + profileShiftRatio, 0, 1)
    const baseWidth = Math.max((window.end - window.start) / 3.2, GAUSSIAN_WIDTH_MIN_RATIO)

    GAUSSIAN_WIDTH_SCALES.forEach(scale => {
      const sigma = Math.max(baseWidth * scale, GAUSSIAN_WIDTH_MIN_RATIO * 0.6)
      const basis = xAxis.map(x => Math.exp(-0.5 * (((x - center) / sigma) ** 2)))
      basisColumns.push(basis)
      basisOwners.push(fractionIndex)
      basisAreas.push(trapezoidArea(basis, 0, basis.length - 1) / Math.max(basis.length - 1, 1))
    })
  })

  if (basisColumns.length === 0) {
    return FRACTION_KEYS.map(() => 100 / FRACTION_KEYS.length)
  }

  const weights = new Array<number>(basisColumns.length).fill(0.1)

  for (let iteration = 0; iteration < GAUSSIAN_FIT_ITERATIONS; iteration += 1) {
    const reconstruction = new Array<number>(values.length).fill(0)

    for (let columnIndex = 0; columnIndex < basisColumns.length; columnIndex += 1) {
      const column = basisColumns[columnIndex]
      const weight = weights[columnIndex]
      for (let sampleIndex = 0; sampleIndex < values.length; sampleIndex += 1) {
        reconstruction[sampleIndex] += column[sampleIndex] * weight
      }
    }

    for (let columnIndex = 0; columnIndex < basisColumns.length; columnIndex += 1) {
      const column = basisColumns[columnIndex]
      let numerator = 0
      let denominator = GAUSSIAN_FIT_EPSILON

      for (let sampleIndex = 0; sampleIndex < values.length; sampleIndex += 1) {
        numerator += column[sampleIndex] * values[sampleIndex]
        denominator += column[sampleIndex] * reconstruction[sampleIndex]
      }

      weights[columnIndex] *= numerator / denominator
    }
  }

  const fractionAreas = new Array<number>(FRACTION_KEYS.length).fill(0)
  for (let columnIndex = 0; columnIndex < basisColumns.length; columnIndex += 1) {
    fractionAreas[basisOwners[columnIndex]] += weights[columnIndex] * basisAreas[columnIndex]
  }

  const totalArea = fractionAreas.reduce((total, area) => total + area, 0)
  if (totalArea <= 0) {
    return FRACTION_KEYS.map(() => 100 / FRACTION_KEYS.length)
  }

  return fractionAreas.map(area => (area / totalArea) * 100)
}

function buildBoundaries(values: number[]) {
  const sampleCount = values.length
  const maxIndex = Math.max(values.length - 1, 0)
  const totalArea = trapezoidArea(values, 0, maxIndex)
  const targetPercentages = fitFractionTargetPercentages(values)

  if (totalArea <= 0) {
    return normalizeBoundaryIndices(
      new Array(FRACTION_KEYS.length + 1).fill(0).map((_, index) => Math.round((index / FRACTION_KEYS.length) * maxIndex)),
      sampleCount,
    )
  }

  const boundaries = [0]
  let accumulatedTarget = 0
  let runningArea = 0
  let cursor = 0

  for (const targetPercentage of targetPercentages.slice(0, -1)) {
    accumulatedTarget += Math.max(0, targetPercentage) / 100
    const targetArea = accumulatedTarget * totalArea
    let boundaryIndex = maxIndex

    while (cursor < maxIndex) {
      const segmentArea = (values[cursor] + values[cursor + 1]) / 2
      const nextArea = runningArea + segmentArea

      if (nextArea >= targetArea) {
        const fractionWithinSegment = segmentArea <= 0 ? 0 : (targetArea - runningArea) / segmentArea
        boundaryIndex = clamp(cursor + Math.round(clampRatio(fractionWithinSegment, 0, 1)), 0, maxIndex)
        break
      }

      runningArea = nextArea
      cursor += 1
    }

    boundaries.push(boundaryIndex)
  }

  boundaries.push(maxIndex)

  const areaOnly = normalizeBoundaryIndices(boundaries, sampleCount)
  const snapped = [...areaOnly]
  const minGap = minGapFor(sampleCount)

  for (let index = 1; index < snapped.length - 1; index += 1) {
    snapped[index] = findNearestReferenceValley(
      values,
      snapped[index],
      snapped[index - 1] + minGap,
      snapped[index + 1] - minGap,
    )
  }

  const areaOnlyError = measureTargetError(values, areaOnly, targetPercentages)
  const snappedError = measureTargetError(values, snapped, targetPercentages)

  if (
    snappedError.maxError > REFERENCE_MAX_FRACTION_ERROR_AFTER_SNAP ||
    snappedError.totalError > areaOnlyError.totalError + REFERENCE_MAX_TOTAL_ERROR_INCREASE_AFTER_SNAP
  ) {
    return areaOnly
  }

  return normalizeBoundaryIndices(snapped, sampleCount)
}

function downsampleProfile(values: number[], maxPoints = PROFILE_DOWNSAMPLE_POINTS) {
  if (values.length <= maxPoints) {
    return values.map((value, index) => ({
      x: values.length === 1 ? 0 : index / (values.length - 1),
      y: value,
    }))
  }

  const sampled: Array<{ x: number; y: number }> = []
  for (let point = 0; point < maxPoints; point += 1) {
    const index = Math.round((point / Math.max(maxPoints - 1, 1)) * (values.length - 1))
    sampled.push({
      x: index / (values.length - 1),
      y: values[index],
    })
  }

  return sampled
}

async function loadImageData(imageUrl: string) {
  const response = await fetch(imageUrl)
  if (!response.ok) {
    throw new Error('No se pudo leer la imagen para procesarla.')
  }

  const blob = await response.blob()
  let bitmap: ImageBitmap

  try {
    bitmap = await createImageBitmap(blob)
  } catch {
    throw new Error('El navegador no pudo decodificar esta imagen. Usa PNG, JPG, WEBP o BMP, o habilita el backend para TIFF.')
  }

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
  const rawProfile = buildRobustProjection(croppedData.data, cropRect.width, cropRect.height, axis)
  const normalizedProfile = normalizeSignal(rawProfile)
  const detectedPeaks = detectLocalMaxima(normalizedProfile)
  const boundaries = buildBoundaries(normalizedProfile)
  const valleys = boundaries.slice(1, -1)
  const totalArea = trapezoidArea(normalizedProfile, boundaries[0], boundaries[boundaries.length - 1])

  if (totalArea <= 0) {
    throw new Error('No fue posible integrar una senal valida para el estudio.')
  }

  const fractions = FRACTION_WINDOWS.reduce<Record<LocalFractionKey, LocalFractionResult>>((accumulator, window, index) => {
    const start = boundaries[index]
    const end = boundaries[index + 1]
    const area = trapezoidArea(normalizedProfile, start, end)
    const percentage = roundTo((area / totalArea) * 100, 2)
    const concentration = input.totalConcentration != null
      ? roundTo((percentage * input.totalConcentration) / 100, 2)
      : null

    accumulator[window.key] = {
      start,
      end,
      peak_index: findPeakIndex(normalizedProfile, start, end),
      area: roundTo(area, 4),
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

  const warningParts = ['Motor local v3.6 calibrado: resultado automatico preliminar; validar con revision manual o PDF antes de informar.']
  if (cropRect.width < CROP_WARNING_MIN_WIDTH || cropRect.height < CROP_WARNING_MIN_HEIGHT) {
    warningParts.push('El recorte es pequeno y puede degradar la estimacion.')
  }
  if (detectedPeaks.length < EXPECTED_PEAK_WARNING_THRESHOLD) {
    warningParts.push('Se detectaron pocos picos; revisar imagen y parametros.')
  }
  if (valleys.some(index => normalizedProfile[index] >= HIGH_VALLEY_WARNING_LEVEL)) {
    warningParts.push('Uno o mas separadores caen en valles poco definidos; revisar posiciones manualmente.')
  }

  return {
    axis,
    image_size: { width: image.width, height: image.height },
    crop_used: cropRect,
    profile_length: normalizedProfile.length,
    detected_peaks: detectedPeaks.length,
    peaks: FRACTION_KEYS.map(key => fractions[key].peak_index),
    valleys,
    total_area: roundTo(totalArea, 4),
    profile_signal: normalizedProfile.map(value => roundTo(value, 6)),
    profile: downsampleProfile(normalizedProfile),
    fractions,
    warning: warningParts.join(' '),
  }
}
