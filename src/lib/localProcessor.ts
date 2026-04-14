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

const FRACTION_KEYS: LocalFractionKey[] = ['albumina', 'alfa_1', 'alfa_2', 'beta_1', 'beta_2', 'gamma']
const FRACTION_WINDOWS: FractionWindow[] = [
  { key: 'albumina', start: 0.0, end: 0.42 },
  { key: 'alfa_1', start: 0.42, end: 0.50 },
  { key: 'alfa_2', start: 0.50, end: 0.62 },
  { key: 'beta_1', start: 0.62, end: 0.70 },
  { key: 'beta_2', start: 0.70, end: 0.78 },
  { key: 'gamma', start: 0.78, end: 1.0 },
]
const BOUNDARY_WINDOWS: Array<[number, number]> = [
  [0.50, 0.60],
  [0.56, 0.66],
  [0.66, 0.76],
  [0.73, 0.82],
  [0.72, 0.87], // Beta 2 / Gamma — calibrado 5 muestras: promedio real 80.5%
]
const EARLY_PROFILE_BOUNDARY_WINDOWS: Array<[number, number]> = [
  [0.28, 0.46],
  [0.50, 0.61],
  [0.58, 0.68],
  [0.65, 0.75],
  [0.72, 0.87],
]
const EARLY_ALBUMIN_PEAK_RATIO = 0.24
const MIN_FRACTION_WIDTH_RATIOS = [0.24, 0.025, 0.055, 0.035, 0.035, 0.08]
const CALIBRATED_BOUNDARY_OFFSETS = [0, 0.005, 0.02, 0, 0]
const GAMMA_COLLAPSE_PERCENTAGE = 3
const GAMMA_COLLAPSE_BOUNDARY_MIN_RATIO = 0.84
const GAMMA_BETA2_TARGET_RATIO = 0.795
const BETA1_BRIDGE_PERCENTAGE = 12
const BETA1_BRIDGE_BETA1_BETA2_TARGET_RATIO = 0.72
const BETA1_BRIDGE_GAMMA_BETA2_TARGET_RATIO = 0.755
const EARLY_ALFA1_INFLATED_PERCENTAGE = 10
const EARLY_ALFA1_ALBUMIN_MAX_PERCENTAGE = 50
const EARLY_ALFA1_BOUNDARY_MAX_RATIO = 0.53
const EARLY_ALFA1_ALBUMIN_ALFA1_TARGET_RATIO = 0.60
const EARLY_ALFA1_ALFA1_ALFA2_TARGET_RATIO = 0.64
const EARLY_ALFA1_ALFA2_BETA1_TARGET_RATIO = 0.72
const PROJECTION_TOP_FRACTION = 0.38
const MIN_SIGNAL_DYNAMIC_RANGE = 9
const HIGH_VALLEY_WARNING_LEVEL = 0.34
const PROFILE_DOWNSAMPLE_POINTS = 700

function clamp(value: number, min: number, max: number) {
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

function normalizeSignal(rawProfile: number[]) {
  if (rawProfile.length < 4) {
    throw new Error('La imagen recortada es demasiado chica para extraer un densitograma.')
  }

  const dynamicRange = percentile(rawProfile, 0.98) - percentile(rawProfile, 0.02)
  if (dynamicRange < MIN_SIGNAL_DYNAMIC_RANGE) {
    throw new Error('La imagen no contiene suficiente contraste para extraer una senal util.')
  }

  const baseline = percentile(rawProfile, 0.05)
  const corrected = rawProfile.map(value => Math.max(0, value - baseline))
  const sigma = Math.max(1.25, corrected.length / 220)
  const smoothed = gaussianSmooth(corrected, sigma)
  const localBaseline = percentile(smoothed, 0.02)
  const cleaned = smoothed.map(value => Math.max(0, value - localBaseline))
  const maxValue = Math.max(...cleaned, 0.000001)
  const normalized = cleaned.map(value => value / maxValue)

  normalized[0] = 0
  normalized[normalized.length - 1] = 0
  return normalized
}

function detectLocalMaxima(values: number[]) {
  const minHeight = 0.025
  const minDistance = Math.max(8, Math.floor(values.length / 20))
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

function findLocalValley(values: number[], startRatio: number, endRatio: number, lower: number, upper: number) {
  const maxIndex = Math.max(values.length - 1, 0)
  const start = Math.max(lower, clamp(Math.round(startRatio * maxIndex), 0, maxIndex))
  const end = Math.min(upper, clamp(Math.round(endRatio * maxIndex), start, maxIndex))
  if (end <= start) return clamp(start, lower, upper)

  let bestIndex = start
  let bestScore = Number.POSITIVE_INFINITY
  const midpoint = (start + end) / 2
  const halfWidth = Math.max((end - start) / 2, 1)

  for (let index = start; index <= end; index += 1) {
    const previous = values[index - 1] ?? values[index]
    const current = values[index]
    const next = values[index + 1] ?? values[index]
    const localShapePenalty = current <= previous && current <= next ? 0 : 0.02
    const centerPenalty = (Math.abs(index - midpoint) / halfWidth) * 0.01
    const score = current + localShapePenalty + centerPenalty

    if (score < bestScore) {
      bestScore = score
      bestIndex = index
    }
  }

  return bestIndex
}

function boundaryRatio(boundaries: number[], boundaryIndex: number, maxIndex: number) {
  return boundaries[boundaryIndex] / Math.max(maxIndex, 1)
}

function fractionPercentages(values: number[], boundaries: number[]) {
  const totalArea = trapezoidArea(values, boundaries[0], boundaries[boundaries.length - 1])
  if (totalArea <= 0) return FRACTION_KEYS.map(() => 0)

  return FRACTION_KEYS.map((_, index) => (
    (trapezoidArea(values, boundaries[index], boundaries[index + 1]) / totalArea) * 100
  ))
}

function setBoundaryRatio(boundaries: number[], boundaryIndex: number, targetRatio: number, maxIndex: number) {
  const target = Math.round(targetRatio * maxIndex)
  const previousBoundary = boundaries[boundaryIndex - 1]
  const nextBoundary = boundaries[boundaryIndex + 1]
  const leftMinWidth = Math.round(MIN_FRACTION_WIDTH_RATIOS[boundaryIndex - 1] * maxIndex)
  const rightMinWidth = Math.round(MIN_FRACTION_WIDTH_RATIOS[boundaryIndex] * maxIndex)
  let lower = previousBoundary + Math.max(leftMinWidth, 1)
  let upper = nextBoundary - Math.max(rightMinWidth, 1)

  if (upper < lower) {
    lower = previousBoundary + 1
    upper = Math.max(lower, nextBoundary - 1)
  }

  boundaries[boundaryIndex] = clamp(target, lower, upper)
}

function applyCalibratedBoundaryRules(values: number[], boundaries: number[]) {
  const maxIndex = Math.max(values.length - 1, 1)
  const calibrated = [...boundaries]
  let percentages = fractionPercentages(values, calibrated)
  const albuminPercentage = percentages[0]
  const alfa1Percentage = percentages[1]

  if (
    alfa1Percentage >= EARLY_ALFA1_INFLATED_PERCENTAGE
    && albuminPercentage <= EARLY_ALFA1_ALBUMIN_MAX_PERCENTAGE
    && boundaryRatio(calibrated, 1, maxIndex) <= EARLY_ALFA1_BOUNDARY_MAX_RATIO
  ) {
    setBoundaryRatio(calibrated, 3, EARLY_ALFA1_ALFA2_BETA1_TARGET_RATIO, maxIndex)
    setBoundaryRatio(calibrated, 2, EARLY_ALFA1_ALFA1_ALFA2_TARGET_RATIO, maxIndex)
    setBoundaryRatio(calibrated, 1, EARLY_ALFA1_ALBUMIN_ALFA1_TARGET_RATIO, maxIndex)
  }

  percentages = fractionPercentages(values, calibrated)
  const beta1Percentage = percentages[3]
  const gammaPercentage = percentages[5]
  const betaGammaBoundaryRatio = boundaryRatio(calibrated, 5, maxIndex)

  if (gammaPercentage <= GAMMA_COLLAPSE_PERCENTAGE && betaGammaBoundaryRatio >= GAMMA_COLLAPSE_BOUNDARY_MIN_RATIO) {
    if (beta1Percentage >= BETA1_BRIDGE_PERCENTAGE) {
      setBoundaryRatio(calibrated, 4, BETA1_BRIDGE_BETA1_BETA2_TARGET_RATIO, maxIndex)
      setBoundaryRatio(calibrated, 5, BETA1_BRIDGE_GAMMA_BETA2_TARGET_RATIO, maxIndex)
    } else {
      setBoundaryRatio(calibrated, 4, Math.min(boundaryRatio(calibrated, 4, maxIndex), GAMMA_BETA2_TARGET_RATIO - 0.04), maxIndex)
      setBoundaryRatio(calibrated, 5, GAMMA_BETA2_TARGET_RATIO, maxIndex)
    }
  }

  return calibrated
}

function buildBoundaries(values: number[]) {
  const maxIndex = Math.max(values.length - 1, 0)
  const minGap = Math.max(2, Math.floor(values.length / 160))
  const boundaries = [0]
  const albuminPeak = findPeakIndex(values, 0, Math.round(0.40 * maxIndex))
  const albuminPeakRatio = albuminPeak / Math.max(maxIndex, 1)
  const activeWindows = albuminPeakRatio < EARLY_ALBUMIN_PEAK_RATIO
    ? EARLY_PROFILE_BOUNDARY_WINDOWS
    : BOUNDARY_WINDOWS

  for (let index = 0; index < activeWindows.length; index += 1) {
    const remainingBoundaries = activeWindows.length - index
    const currentMinWidth = Math.round(MIN_FRACTION_WIDTH_RATIOS[index] * maxIndex)
    const futureMinWidth = Math.round(MIN_FRACTION_WIDTH_RATIOS.slice(index + 1).reduce((total, width) => total + width, 0) * maxIndex)
    const lower = Math.max(boundaries[boundaries.length - 1] + minGap, boundaries[boundaries.length - 1] + currentMinWidth)
    const upper = Math.max(lower, Math.min(maxIndex - remainingBoundaries * minGap, maxIndex - futureMinWidth))
    const [start, end] = activeWindows[index]
    let boundary = findLocalValley(values, start, end, lower, upper)
    const offset = CALIBRATED_BOUNDARY_OFFSETS[index]
    boundary = clamp(boundary + Math.round(offset * maxIndex), lower, upper)
    boundaries.push(boundary)
  }

  boundaries.push(maxIndex)
  return applyCalibratedBoundaryRules(values, boundaries)
}

function findPeakIndex(values: number[], start: number, end: number) {
  let peakIndex = start
  let peakValue = Number.NEGATIVE_INFINITY

  for (let index = start; index <= end; index += 1) {
    if (values[index] > peakValue) {
      peakValue = values[index]
      peakIndex = index
    }
  }

  return peakIndex
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

  const warningParts = ['Motor local v3.3 calibrado: resultado automatico preliminar; validar con revision manual o PDF antes de informar.']
  if (cropRect.width < 80 || cropRect.height < 35) {
    warningParts.push('El recorte es pequeno y puede degradar la estimacion.')
  }
  if (detectedPeaks.length < 4) {
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
    profile: downsampleProfile(normalizedProfile),
    fractions,
    warning: warningParts.join(' '),
  }
}
