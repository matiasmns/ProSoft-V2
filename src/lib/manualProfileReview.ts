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

const FRACTION_KEYS: LocalFractionKey[] = ['albumina', 'alfa_1', 'alfa_2', 'beta_1', 'beta_2', 'gamma']
const MIN_SEPARATOR_COUNT = FRACTION_KEYS.length + 1

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
  const sampleCount = Math.max(1, result.profile.length)
  const originalMax = Math.max(1, result.profile_length - 1)
  const internalRatios = result.valleys.map(valley => clamp(valley / originalMax, 0, 1))
  return normalizeSeparatorRatios([0, ...internalRatios, 1], sampleCount)
}

export function snapSeparatorRatio(
  result: LocalProcessorResult,
  ratios: number[],
  separatorIndex: number,
  targetRatio: number,
) {
  const values = result.profile.map(point => point.y)
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
  const sampleCount = Math.max(1, result.profile.length)
  const values = result.profile.map(point => point.y)
  const separatorRatios = normalizeSeparatorRatios(ratios, sampleCount)
  const separatorIndices = ratiosToIndices(separatorRatios, sampleCount)
  const totalArea = Math.max(trapezoidArea(values, separatorIndices[0], separatorIndices[separatorIndices.length - 1]), 0)
  const safeTotalArea = totalArea > 0 ? totalArea : 1

  const separators = REVIEW_SEPARATOR_DEFS.map((definition, index) => {
    const point = result.profile[separatorIndices[index]] ?? result.profile[result.profile.length - 1] ?? { x: 0, y: 0 }
    return {
      ...definition,
      ratio: separatorRatios[index],
      index: separatorIndices[index],
      x: point.x,
      y: point.y,
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
