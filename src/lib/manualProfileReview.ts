import type { LocalFractionKey, LocalFractionResult, LocalProcessorResult } from './localProcessor'

export type ReviewSeparatorDefinition = {
  id: string
  label: string
  color: string
}

export type ReviewSeparatorView = ReviewSeparatorDefinition & {
  ratio: number
  index: number
  x: number
  y: number
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
const REFERENCE_MAX_FRACTION_ERROR_AFTER_SNAP = 1.25
const REFERENCE_MAX_TOTAL_ERROR_INCREASE_AFTER_SNAP = 1.5

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

function interpolateProfileY(profile: LocalProcessorResult['profile'], ratio: number) {
  if (profile.length === 0) return 0
  const safeRatio = clamp(ratio, 0, 1)
  const first = profile[0]
  const last = profile[profile.length - 1]
  if (safeRatio <= first.x) return first.y
  if (safeRatio >= last.x) return last.y

  for (let index = 1; index < profile.length; index += 1) {
    const previous = profile[index - 1]
    const current = profile[index]
    if (safeRatio > current.x) continue

    const span = current.x - previous.x
    if (span <= 0) return current.y
    const localRatio = (safeRatio - previous.x) / span
    return previous.y + ((current.y - previous.y) * localRatio)
  }

  return last.y
}

function trapezoidArea(values: number[], start: number, end: number) {
  if (end <= start) return 0

  let total = 0
  for (let index = start; index < end; index += 1) {
    total += (values[index] + values[index + 1]) / 2
  }

  return total
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

function buildTargetPercentages(targets: ReferenceFractionTargets, totalTarget: number) {
  return FRACTION_KEYS.map(key => (Math.max(0, targets[key]) / totalTarget) * 100)
}

function buildAreaPercentages(values: number[], indices: number[]) {
  const totalArea = trapezoidArea(values, indices[0], indices[indices.length - 1])
  const safeTotalArea = totalArea > 0 ? totalArea : 1

  return FRACTION_KEYS.map((_, index) => (
    (trapezoidArea(values, indices[index], indices[index + 1]) / safeTotalArea) * 100
  ))
}

function measureTargetError(values: number[], indices: number[], targetPercentages: number[]) {
  const percentages = buildAreaPercentages(values, indices)
  const errors = percentages.map((percentage, index) => Math.abs(percentage - targetPercentages[index]))

  return {
    totalError: errors.reduce((total, error) => total + error, 0),
    maxError: Math.max(...errors),
  }
}

export function normalizeSeparatorRatios(ratios: number[], sampleCount: number) {
  const maxIndex = Math.max(0, sampleCount - 1)
  if (maxIndex === 0) return new Array(MIN_SEPARATOR_COUNT).fill(0)

  const minGap = minGapFor(sampleCount)
  const source = ratios.length === MIN_SEPARATOR_COUNT ? ratios : new Array(MIN_SEPARATOR_COUNT).fill(0).map((_, index) => (
    index / (MIN_SEPARATOR_COUNT - 1)
  ))

  const indices = source.map(ratio => Math.round(clamp(ratio, 0, 1) * maxIndex))

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
  const internalRatios = result.valleys.map(valley => clamp(valley / originalMax, 0, 1))
  return normalizeSeparatorRatios([0, ...internalRatios, 1], sampleCount)
}

export function buildReferenceSeparatorRatios(result: LocalProcessorResult, targets: ReferenceFractionTargets) {
  const values = readAnalysisValues(result)
  const sampleCount = values.length
  const maxIndex = Math.max(0, sampleCount - 1)
  if (maxIndex === 0) return normalizeSeparatorRatios([], sampleCount)

  const totalTarget = FRACTION_KEYS.reduce((total, key) => (
    total + Math.max(0, Number.isFinite(targets[key]) ? targets[key] : 0)
  ), 0)
  const totalArea = trapezoidArea(values, 0, maxIndex)

  if (totalTarget <= 0 || totalArea <= 0) return buildDefaultSeparatorRatios(result)

  const indices = [0]
  let accumulatedTarget = 0

  for (const key of FRACTION_KEYS.slice(0, -1)) {
    accumulatedTarget += Math.max(0, targets[key]) / totalTarget
    const targetArea = accumulatedTarget * totalArea
    let runningArea = 0
    let targetIndex = maxIndex

    for (let index = 0; index < maxIndex; index += 1) {
      const segmentArea = (values[index] + values[index + 1]) / 2
      const nextArea = runningArea + segmentArea

      if (nextArea >= targetArea) {
        const fractionWithinSegment = segmentArea > 0 ? (targetArea - runningArea) / segmentArea : 0
        targetIndex = clamp(index + Math.round(clamp(fractionWithinSegment, 0, 1)), 0, maxIndex)
        break
      }

      runningArea = nextArea
    }

    indices.push(targetIndex)
  }

  indices.push(maxIndex)

  const normalizedIndices = ratiosToIndices(indices.map(index => index / maxIndex), sampleCount)
  const areaOnlyIndices = [...normalizedIndices]
  const minGap = minGapFor(sampleCount)

  for (let index = 1; index < normalizedIndices.length - 1; index += 1) {
    normalizedIndices[index] = findNearestReferenceValley(
      values,
      normalizedIndices[index],
      normalizedIndices[index - 1] + minGap,
      normalizedIndices[index + 1] - minGap,
    )
  }

  const targetPercentages = buildTargetPercentages(targets, totalTarget)
  const areaOnlyError = measureTargetError(values, areaOnlyIndices, targetPercentages)
  const snappedError = measureTargetError(values, normalizedIndices, targetPercentages)

  if (
    snappedError.maxError > REFERENCE_MAX_FRACTION_ERROR_AFTER_SNAP ||
    snappedError.totalError > areaOnlyError.totalError + REFERENCE_MAX_TOTAL_ERROR_INCREASE_AFTER_SNAP
  ) {
    return normalizeSeparatorRatios(areaOnlyIndices.map(index => index / maxIndex), sampleCount)
  }

  return normalizeSeparatorRatios(normalizedIndices.map(index => index / maxIndex), sampleCount)
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

  const radius = Math.max(2, Math.floor(sampleCount / 40))
  let snappedIndex = targetIndex
  let snappedValue = values[targetIndex] ?? 0

  for (let index = Math.max(minAllowed, targetIndex - radius); index <= Math.min(maxAllowed, targetIndex + radius); index += 1) {
    if (values[index] <= snappedValue) {
      snappedValue = values[index]
      snappedIndex = index
    }
  }

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
  const separatorRatios = normalizeSeparatorRatios(ratios, sampleCount)
  const separatorIndices = ratiosToIndices(separatorRatios, sampleCount)
  const totalArea = Math.max(trapezoidArea(values, separatorIndices[0], separatorIndices[separatorIndices.length - 1]), 0)
  const safeTotalArea = totalArea > 0 ? totalArea : 1

  const separators = REVIEW_SEPARATOR_DEFS.map((definition, index) => {
    const ratio = separatorRatios[index]
    return {
      ...definition,
      ratio,
      index: separatorIndices[index],
      x: ratio,
      y: interpolateProfileY(result.profile, ratio),
    }
  })

  const fractions = FRACTION_KEYS.reduce<Record<LocalFractionKey, LocalFractionResult>>((accumulator, key, index) => {
    const start = separatorIndices[index]
    const end = separatorIndices[index + 1]
    const peakIndex = findPeakIndex(values, start, end)
    const area = trapezoidArea(values, start, end)
    const percentage = roundTo((area / safeTotalArea) * 100, 2)
    const concentration = totalConcentration != null
      ? roundTo((percentage * totalConcentration) / 100, 2)
      : null

    accumulator[key] = {
      start,
      end,
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
