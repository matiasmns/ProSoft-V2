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
  { key: 'albumina', start: 0.0, end: 0.22 },
  { key: 'alfa_1', start: 0.22, end: 0.32 },
  { key: 'alfa_2', start: 0.32, end: 0.45 },
  { key: 'beta_1', start: 0.45, end: 0.58 },
  { key: 'beta_2', start: 0.58, end: 0.7 },
  { key: 'gamma', start: 0.7, end: 1.0 },
]

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

  const step = (values.length - 1) / (maxPoints - 1)
  const sampled: Array<{ x: number; y: number }> = []

  for (let point = 0; point < maxPoints; point += 1) {
    const index = Math.round(point * step)
    sampled.push({
      x: index / (values.length - 1),
      y: values[index],
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

  let smoothWindow = Math.max(5, Math.floor(correctedProfile.length / 40))
  if (smoothWindow % 2 === 0) smoothWindow += 1

  const smoothedProfile = movingAverage(correctedProfile, smoothWindow)
  const maxValue = Math.max(...smoothedProfile, 1)
  const normalizedProfile = smoothedProfile.map(value => value / maxValue)

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

  const valleys = peakIndexes.slice(0, -1).map((peakIndex, index) => (
    findValley(normalizedProfile, peakIndex, peakIndexes[index + 1])
  ))

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
