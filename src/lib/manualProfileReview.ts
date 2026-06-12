import type { LocalFractionKey, LocalFractionResult, LocalProcessorResult } from './localProcessor'

type ReviewSeparatorDefinition = {
  id: string
  label: string
  color: string
}

type ReviewSeparatorView = ReviewSeparatorDefinition & {
  ratio: number
  index: number
  x: number
  y: number
  isLocalMinimum: boolean
  valleyDepth: number
  warning: string | null
}

export type ManualReviewData = {
  separatorRatios: number[]
  separators: ReviewSeparatorView[]
  fractions: Record<LocalFractionKey, LocalFractionResult>
  totalArea: number
}

export type ReferenceFractionTargets = Record<LocalFractionKey, number>

const FRACTION_KEYS: LocalFractionKey[] = ['albumina', 'alfa_1', 'alfa_2', 'beta_1', 'beta_2', 'gamma']
const MIN_SEPARATOR_COUNT = FRACTION_KEYS.length + 1
const REFERENCE_VALLEY_SNAP_WINDOW_RATIO = 0.04
const REVIEW_HIGH_VALLEY_WARNING_LEVEL = 0.34
const REVIEW_LOW_VALLEY_DEPTH_WARNING = 0.035

export const REVIEW_SEPARATOR_DEFS: ReviewSeparatorDefinition[] = [
  { id: 'inicio', label: 'Inicio', color: '#D64545' },
  { id: 'alb_a1', label: 'Alb / A1', color: '#94BB66' },
  { id: 'a1_a2', label: 'A1 / A2', color: '#2F80ED' },
  { id: 'a2_b1', label: 'A2 / B1', color: '#3D7D44' },
  { id: 'b1_b2', label: 'B1 / B2', color: '#D4B530' },
  { id: 'b2_g', label: 'B2 / G', color: '#F2994A' },
  { id: 'fin', label: 'Fin', color: '#56CCF2' },
]

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function roundTo(value: number, digits: number) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function readAnalysisValues(result: LocalProcessorResult) {
  const values = Array.isArray(result.profile_signal)
    ? result.profile_signal.filter((value): value is number => Number.isFinite(value))
    : []

  if (values.length > 1) return values
  return result.profile.map(point => point.y)
}

function readAnalysisSampleCount(result: LocalProcessorResult) {
  return Math.max(1, readAnalysisValues(result).length)
}

function readSignalValue(values: number[], index: number) {
  if (values.length === 0) return 0
  const safeIndex = clamp(index, 0, values.length - 1)
  return values[safeIndex] ?? 0
}

function analyzeValley(values: number[], index: number) {
  const current = readSignalValue(values, index)
  const previous = readSignalValue(values, index - 1)
  const next = readSignalValue(values, index + 1)
  const outerPrevious = readSignalValue(values, index - 2)
  const outerNext = readSignalValue(values, index + 2)
  const isLocalMinimum = current <= previous && current <= next
  const valleyDepth = Math.max(0, Math.max(previous, outerPrevious) - current) + Math.max(0, Math.max(next, outerNext) - current)

  return {
    current,
    isLocalMinimum,
    valleyDepth,
  }
}

function buildSeparatorWarning(isLocked: boolean, y: number, isLocalMinimum: boolean, valleyDepth: number) {
  if (isLocked) return null
  if (!isLocalMinimum) return 'El separador no cae en un minimo local real.'
  if (y >= REVIEW_HIGH_VALLEY_WARNING_LEVEL) return 'El separador cae en un valle poco profundo.'
  if (valleyDepth < REVIEW_LOW_VALLEY_DEPTH_WARNING) return 'El minimo es debil y puede ser inestable.'
  return null
}

function interpolateSignalValue(values: number[], position: number) {
  if (values.length === 0) return 0
  const maxIndex = values.length - 1
  const safePosition = clamp(position, 0, maxIndex)
  const leftIndex = Math.floor(safePosition)
  const rightIndex = Math.min(leftIndex + 1, maxIndex)
  const fraction = safePosition - leftIndex
  return values[leftIndex] + ((values[rightIndex] - values[leftIndex]) * fraction)
}

function trapezoidAreaBetween(values: number[], start: number, end: number) {
  if (values.length < 2 || end <= start) return 0

  const maxIndex = values.length - 1
  let cursor = clamp(start, 0, maxIndex)
  const safeEnd = clamp(end, 0, maxIndex)
  let total = 0

  while (cursor < safeEnd) {
    const next = Math.min(Math.floor(cursor) + 1, safeEnd)
    const cursorY = interpolateSignalValue(values, cursor)
    const nextY = interpolateSignalValue(values, next)
    total += ((cursorY + nextY) / 2) * (next - cursor)
    cursor = next
  }

  return total
}

function findPositionForArea(values: number[], targetArea: number, maxIndex: number) {
  const totalArea = trapezoidAreaBetween(values, 0, maxIndex)
  if (totalArea <= 0) return 0

  const safeTarget = clamp(targetArea, 0, totalArea)
  let low = 0
  let high = maxIndex

  for (let iteration = 0; iteration < 36; iteration += 1) {
    const middle = (low + high) / 2
    const area = trapezoidAreaBetween(values, 0, middle)
    if (area < safeTarget) {
      low = middle
    } else {
      high = middle
    }
  }

  return (low + high) / 2
}

function findPeakIndex(values: number[], start: number, end: number) {
  const safeStart = Math.max(0, Math.ceil(start))
  const safeEnd = Math.min(values.length - 1, Math.floor(end))
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

function minGapFor(sampleCount: number) {
  const baseGap = sampleCount >= 180 ? 4 : sampleCount >= 90 ? 3 : 2
  const maxIndex = Math.max(0, sampleCount - 1)
  const feasibleGap = Math.max(1, Math.floor(maxIndex / Math.max(1, MIN_SEPARATOR_COUNT - 1)))
  return Math.min(baseGap, feasibleGap)
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
    const current = values[index] ?? Number.POSITIVE_INFINITY
    const next = values[index + 1] ?? values[index]
    const outerPrevious = values[index - 2] ?? previous
    const outerNext = values[index + 2] ?? next
    const isLocalMinimum = current <= previous && current <= next

    if (!isLocalMinimum && foundLocalMinimum) continue

    const localDepth = Math.max(0, Math.max(previous, outerPrevious) - current) + Math.max(0, Math.max(next, outerNext) - current)
    const distancePenalty = (Math.abs(index - safeTarget) / Math.max(radius, 1)) * 0.03
    const valleyBonus = Math.min(localDepth, 1) * 0.18
    const score = current + distancePenalty - valleyBonus

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

export function normalizeSeparatorRatios(ratios: number[], sampleCount: number) {
  const maxIndex = Math.max(0, sampleCount - 1)
  if (maxIndex === 0) return new Array(MIN_SEPARATOR_COUNT).fill(0)

  const minGap = minGapFor(sampleCount)
  const source = ratios.length === MIN_SEPARATOR_COUNT ? ratios : new Array(MIN_SEPARATOR_COUNT).fill(0).map((_, index) => (
    index / (MIN_SEPARATOR_COUNT - 1)
  ))

  const indices = source.map(ratio => clamp(ratio, 0, 1) * maxIndex)

  for (let index = 0; index < indices.length; index += 1) {
    const minAllowed = index === 0 ? 0 : indices[index - 1] + minGap
    const maxAllowed = maxIndex - ((indices.length - 1 - index) * minGap)
    indices[index] = clamp(indices[index], minAllowed, maxAllowed)
  }

  for (let index = indices.length - 2; index >= 0; index -= 1) {
    const maxAllowed = indices[index + 1] - minGap
    const minAllowed = index === 0 ? 0 : indices[index - 1] + minGap
    indices[index] = clamp(indices[index], minAllowed, maxAllowed)
  }

  return indices.map(index => index / maxIndex)
}

export function ratiosToIndices(ratios: number[], sampleCount: number) {
  const maxIndex = Math.max(0, sampleCount - 1)
  if (maxIndex === 0) return new Array(MIN_SEPARATOR_COUNT).fill(0)

  const normalized = normalizeSeparatorRatios(ratios, sampleCount)
  return normalized.map(ratio => Math.round(ratio * maxIndex))
}

export function buildDefaultSeparatorRatios(result: LocalProcessorResult) {
  const sampleCount = readAnalysisSampleCount(result)
  const originalMax = Math.max(1, sampleCount - 1)
  const storedBoundaries = Array.isArray(result.boundaries) && result.boundaries.length === MIN_SEPARATOR_COUNT
    ? result.boundaries
    : [0, ...result.valleys, originalMax]
  const internalRatios = storedBoundaries.slice(1, -1).map(boundary => clamp(boundary / originalMax, 0, 1))
  return normalizeSeparatorRatios([0, ...internalRatios, 1], sampleCount)
}

export function buildDetectedValleySeparatorRatios(result: LocalProcessorResult) {
  const values = readAnalysisValues(result)
  const sampleCount = readAnalysisSampleCount(result)
  const maxIndex = Math.max(0, sampleCount - 1)
  if (maxIndex === 0) return normalizeSeparatorRatios([], sampleCount)

  const defaultRatios = buildDefaultSeparatorRatios(result)
  const targetIndices = defaultRatios.slice(1, -1).map(ratio => ratio * maxIndex)
  const rawValleys = Array.isArray(result.detected_valleys) && result.detected_valleys.length > 0
    ? result.detected_valleys
    : result.valleys
  const detectedValleys = rawValleys
    .filter((value): value is number => Number.isFinite(value))
    .map(value => Math.round(clamp(value, 0, maxIndex)))
    .filter(index => index > 0 && index < maxIndex)
    .sort((left, right) => left - right)

  if (detectedValleys.length === 0) return defaultRatios

  const minGap = minGapFor(sampleCount)
  const snapWindow = Math.max(minGap * 2, Math.round(maxIndex * 0.06))
  const selectedIndices: number[] = []

  for (let index = 0; index < targetIndices.length; index += 1) {
    const previous = selectedIndices[index - 1] ?? 0
    const remainingSeparators = targetIndices.length - index - 1
    const minAllowed = previous + minGap
    const maxAllowed = maxIndex - ((remainingSeparators + 1) * minGap)
    const safeTarget = clamp(targetIndices[index], minAllowed, maxAllowed)
    const candidates = detectedValleys.filter(candidate => (
      candidate >= minAllowed &&
      candidate <= maxAllowed &&
      Math.abs(candidate - safeTarget) <= snapWindow &&
      !selectedIndices.includes(candidate)
    ))

    if (candidates.length === 0) {
      selectedIndices.push(safeTarget)
      continue
    }

    const bestCandidate = candidates.reduce((best, candidate) => {
      const bestDistance = Math.abs(best - safeTarget)
      const candidateDistance = Math.abs(candidate - safeTarget)
      if (candidateDistance !== bestDistance) return candidateDistance < bestDistance ? candidate : best
      return readSignalValue(values, candidate) < readSignalValue(values, best) ? candidate : best
    })
    selectedIndices.push(bestCandidate)
  }

  return normalizeSeparatorRatios([0, ...selectedIndices, maxIndex].map(index => index / maxIndex), sampleCount)
}

export function buildReferenceSeparatorRatios(result: LocalProcessorResult, targets: ReferenceFractionTargets) {
  const values = readAnalysisValues(result)
  const sampleCount = values.length
  const maxIndex = Math.max(0, sampleCount - 1)
  if (maxIndex === 0) return normalizeSeparatorRatios([], sampleCount)

  const totalTarget = FRACTION_KEYS.reduce((total, key) => (
    total + Math.max(0, Number.isFinite(targets[key]) ? targets[key] : 0)
  ), 0)
  const totalArea = trapezoidAreaBetween(values, 0, maxIndex)

  if (totalTarget <= 0 || totalArea <= 0) return buildDefaultSeparatorRatios(result)

  const positions = [0]
  let accumulatedTarget = 0

  for (const key of FRACTION_KEYS.slice(0, -1)) {
    accumulatedTarget += Math.max(0, targets[key]) / totalTarget
    positions.push(findPositionForArea(values, accumulatedTarget * totalArea, maxIndex))
  }

  positions.push(maxIndex)

  return normalizeSeparatorRatios(positions.map(position => position / maxIndex), sampleCount)
}

export function snapSeparatorRatio(
  result: LocalProcessorResult,
  ratios: number[],
  separatorIndex: number,
  targetRatio: number,
) {
  const values = readAnalysisValues(result)
  const sampleCount = values.length
  const maxIndex = Math.max(0, sampleCount - 1)
  if (sampleCount === 0) return ratios

  const minGap = minGapFor(sampleCount)
  const indices = ratiosToIndices(ratios, sampleCount)
  const minAllowed = separatorIndex === 0 ? 0 : indices[separatorIndex - 1] + minGap
  const maxAllowed = separatorIndex === indices.length - 1 ? maxIndex : indices[separatorIndex + 1] - minGap
  const targetIndex = clamp(Math.round(clamp(targetRatio, 0, 1) * maxIndex), minAllowed, maxAllowed)
  const snappedIndex = findNearestReferenceValley(values, targetIndex, minAllowed, maxAllowed)

  const nextIndices = [...indices]
  nextIndices[separatorIndex] = snappedIndex
  return normalizeSeparatorRatios(nextIndices.map(index => maxIndex === 0 ? 0 : index / maxIndex), sampleCount)
}

export function buildManualReviewData(
  result: LocalProcessorResult,
  ratios: number[],
  totalConcentration: number | null,
): ManualReviewData {
  const values = readAnalysisValues(result)
  const sampleCount = Math.max(1, values.length)
  const maxIndex = Math.max(0, sampleCount - 1)
  const separatorRatios = normalizeSeparatorRatios(ratios, sampleCount)
  const separatorIndices = ratiosToIndices(separatorRatios, sampleCount)
  const separatorPositions = separatorRatios.map(ratio => ratio * maxIndex)
  const totalArea = Math.max(trapezoidAreaBetween(values, separatorPositions[0], separatorPositions[separatorPositions.length - 1]), 0)
  const safeTotalArea = totalArea > 0 ? totalArea : 1

  const separators = REVIEW_SEPARATOR_DEFS.map((definition, index) => {
    const ratio = separatorRatios[index]
    const signalIndex = separatorIndices[index]
    const isLocked = index === 0 || index === REVIEW_SEPARATOR_DEFS.length - 1
    const valley = analyzeValley(values, signalIndex)
    return {
      ...definition,
      ratio,
      index: signalIndex,
      x: ratio,
      y: valley.current,
      isLocalMinimum: isLocked ? true : valley.isLocalMinimum,
      valleyDepth: isLocked ? 0 : roundTo(valley.valleyDepth, 6),
      warning: buildSeparatorWarning(isLocked, valley.current, valley.isLocalMinimum, valley.valleyDepth),
    }
  })

  const fractions = FRACTION_KEYS.reduce<Record<LocalFractionKey, LocalFractionResult>>((accumulator, key, index) => {
    const start = separatorPositions[index]
    const end = separatorPositions[index + 1]
    const peakIndex = findPeakIndex(values, start, end)
    const area = trapezoidAreaBetween(values, start, end)
    const percentage = roundTo((area / safeTotalArea) * 100, 2)
    const concentration = totalConcentration != null
      ? roundTo((percentage * totalConcentration) / 100, 2)
      : null

    accumulator[key] = {
      start: roundTo(start, 4),
      end: roundTo(end, 4),
      peak_index: peakIndex,
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

  return {
    separatorRatios,
    separators,
    fractions,
    totalArea: roundTo(totalArea, 4),
  }
}
