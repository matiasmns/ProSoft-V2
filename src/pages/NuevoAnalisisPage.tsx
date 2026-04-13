import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { AlertCircle, CheckCircle, FlaskConical, ImageIcon, Play, Printer } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { ANALYSIS_API_ENABLED, ANALYSIS_API_URL, processElectrophoresisWithBackend } from '../lib/backendProcessor'
import {
  createCroppedAnalisisImagePreview,
  createSignedAnalisisImageUrl,
  type CropPayload,
} from '../lib/electroforesis'
import { processElectrophoresisImage, type LocalProcessorResult } from '../lib/localProcessor'
import {
  REVIEW_SEPARATOR_DEFS,
  buildDefaultSeparatorRatios,
  buildManualReviewData,
  buildReferenceSeparatorRatios,
  normalizeSeparatorRatios,
  snapSeparatorRatio,
  type ManualReviewData,
  type ReferenceFractionTargets,
} from '../lib/manualProfileReview'
import Sidebar from '../components/Sidebar'
import TopBar from '../components/TopBar'

type ImagePreview = { preview: string; processingPreview: string; tipo: string; nombre: string; storagePath?: string; draftCrop?: CropPayload | null }
type AnalisisImagenRow = { tipo: string | null; url: string; nombre_archivo: string | null }
type FlexibleCropState = {
  izquierda?: number | string | null
  arriba?: number | string | null
  ancho?: number | string | null
  alto?: number | string | null
  separacion?: number | string | null
}
type IncomingImageState = { preview?: string; tipo?: string; nombre?: string; storagePath?: string; crop?: FlexibleCropState | CropPayload | null }
type AnalisisRow = {
  id: string
  numero_placa: string | null
  numero_muestra: string | null
  numero_paciente: string | null
  cantidad_picos: number | null
  concentracion_total: number | null
  observaciones_generales: string | null
  albumina_porcentaje: number | null
  albumina_concentracion: number | null
  alfa_1_porcentaje: number | null
  alfa_1_concentracion: number | null
  alfa_2_porcentaje: number | null
  alfa_2_concentracion: number | null
  beta_1_porcentaje: number | null
  beta_1_concentracion: number | null
  beta_2_porcentaje: number | null
  beta_2_concentracion: number | null
  gamma_porcentaje: number | null
  gamma_concentracion: number | null
  resultado_crudo: Record<string, unknown> | null
}
type RawInputImage = { nombre: string; tipo: string; storage_path: string | null; crop: CropPayload | null }
type FraccionKey = 'albumina' | 'alfa_1' | 'alfa_2' | 'beta_1' | 'beta_2' | 'gamma'
type FraccionVals = Record<FraccionKey, { pct: string; conc: string }>
type ProcessorSource = 'backend_fastapi' | 'frontend_local_fallback'
type ProcessorMode = 'auto' | 'local'
type BackendStatus = 'disabled' | 'unknown' | 'available' | 'unavailable'
type ProcessorMeta = {
  source: ProcessorSource | null
  algorithmVersion: string
  calibrationProfile: string
  calibrationVersion: string
  backendFallbackDetail: string
}
type ReferenceCalibrationState = {
  source: 'pdf_external'
  targets: ReferenceFractionTargets
  pattern: CalibrationPattern
}
type CalibrationPattern = 'normal' | 'gamma_alta' | 'beta_gamma_bridge' | 'albumina_baja' | 'inflamatorio' | 'otro'
type FractionReference = {
  percent: string
  concentration: string
}

const fracciones: Array<{ key: FraccionKey; label: string }> = [
  { key: 'albumina', label: 'Albumina' },
  { key: 'alfa_1', label: 'Alfa 1' },
  { key: 'alfa_2', label: 'Alfa 2' },
  { key: 'beta_1', label: 'Beta 1' },
  { key: 'beta_2', label: 'Beta 2' },
  { key: 'gamma', label: 'Gamma' },
]
const globulinFractionKeys: FraccionKey[] = ['alfa_1', 'alfa_2', 'beta_1', 'beta_2', 'gamma']
const alphaFractionKeys: FraccionKey[] = ['alfa_1', 'alfa_2']
const betaFractionKeys: FraccionKey[] = ['beta_1', 'beta_2']
const DEFAULT_CALIBRATION_PATTERN: CalibrationPattern = 'normal'
const CALIBRATION_PATTERN_OPTIONS: Array<{ value: CalibrationPattern; label: string }> = [
  { value: 'normal', label: 'Normal' },
  { value: 'gamma_alta', label: 'Gamma alta' },
  { value: 'beta_gamma_bridge', label: 'Puente beta/gamma' },
  { value: 'albumina_baja', label: 'Albumina baja' },
  { value: 'inflamatorio', label: 'Inflamatorio' },
  { value: 'otro', label: 'Otro' },
]
// Rangos iniciales de referencia para SPEP en adultos. Confirmar y ajustar segun el metodo validado del laboratorio.
const FRACTION_REFERENCES: Record<FraccionKey, FractionReference> = {
  albumina: { percent: '55.8 - 66.1', concentration: '40.20 - 47.60' },
  alfa_1: { percent: '2.9 - 4.9', concentration: '2.10 - 3.50' },
  alfa_2: { percent: '7.1 - 11.8', concentration: '5.10 - 8.50' },
  beta_1: { percent: '4.7 - 7.2', concentration: '3.40 - 5.20' },
  beta_2: { percent: '3.2 - 6.5', concentration: '2.30 - 4.70' },
  gamma: { percent: '11.1 - 18.8', concentration: '8.00 - 13.50' },
}

const inputClass = 'w-full rounded-lg px-3 py-2 text-sm outline-none transition'
const compactInputClass = 'w-full rounded-md px-2.5 py-1.5 text-xs outline-none transition'
const inputStyle = { background: '#FFFFFF', color: '#54585E', border: '1px solid #DFE0E5' }
const PROCESSOR_MODE_STORAGE_KEY = 'prosoft.analysis.processor_mode'
const BACKEND_STATUS_STORAGE_KEY = 'prosoft.analysis.backend_status'
const REVIEW_SEPARATOR_COUNT = REVIEW_SEPARATOR_DEFS.length
const REFERENCE_TARGET_SUM_TOLERANCE = 1
const PRINT_STYLES = `
  @media screen {
    .analysis-print {
      display: none;
    }
  }

  @media print {
    @page {
      size: A4 portrait;
      margin: 12mm;
    }

    body {
      background: #FFFFFF;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .analysis-screen {
      display: none !important;
    }

    .analysis-print {
      display: block !important;
    }
  }
`
const emptyProcessorMeta: ProcessorMeta = {
  source: null,
  algorithmVersion: '',
  calibrationProfile: '',
  calibrationVersion: '',
  backendFallbackDetail: '',
}

function createEmptyVals(): FraccionVals {
  return {
    albumina: { pct: '', conc: '' },
    alfa_1: { pct: '', conc: '' },
    alfa_2: { pct: '', conc: '' },
    beta_1: { pct: '', conc: '' },
    beta_2: { pct: '', conc: '' },
    gamma: { pct: '', conc: '' },
  }
}

function createEmptyReferenceTargets(): Record<FraccionKey, string> {
  return {
    albumina: '',
    alfa_1: '',
    alfa_2: '',
    beta_1: '',
    beta_2: '',
    gamma: '',
  }
}

function focusGreen(event: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) { event.currentTarget.style.borderColor = '#5C894A' }
function blurGray(event: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) { event.currentTarget.style.borderColor = '#DFE0E5' }
function toTextValue(value: number | null | undefined) { return value != null ? value.toString() : '' }

function calculateConcentration(percentual: string, total: string) {
  const percentValue = Number(percentual)
  const totalValue = Number(total)
  if (!percentual.trim() || !total.trim() || !Number.isFinite(percentValue) || !Number.isFinite(totalValue)) return ''
  return ((percentValue * totalValue) / 100).toFixed(2)
}

function parseResultNumber(value: string) {
  const parsed = Number(value)
  return value.trim() && Number.isFinite(parsed) ? parsed : null
}

function parseTotalConcentration(value: string) {
  const parsed = Number(value)
  return value.trim() && Number.isFinite(parsed) ? parsed : null
}

function sumFractionValues(vals: FraccionVals, keys: FraccionKey[], field: 'pct' | 'conc') {
  const values = keys.map(key => parseResultNumber(vals[key][field]))
  const hasAnyValue = values.some(value => value != null)
  if (!hasAnyValue) return null

  return values.reduce<number>((total, value) => total + (value ?? 0), 0)
}

function formatDerivedValue(value: number | null, suffix = '') {
  if (value == null || !Number.isFinite(value)) return ''
  return `${value.toFixed(2)}${suffix}`
}

function roundTo(value: number, digits: number) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function buildDerivedAnalysisValues(vals: FraccionVals) {
  const albuminPct = parseResultNumber(vals.albumina.pct)
  const globulinPct = sumFractionValues(vals, globulinFractionKeys, 'pct')
  const alphaPct = sumFractionValues(vals, alphaFractionKeys, 'pct')
  const betaPct = sumFractionValues(vals, betaFractionKeys, 'pct')

  const albuminConc = parseResultNumber(vals.albumina.conc)
  const globulinConc = sumFractionValues(vals, globulinFractionKeys, 'conc')
  const alphaConc = sumFractionValues(vals, alphaFractionKeys, 'conc')
  const betaConc = sumFractionValues(vals, betaFractionKeys, 'conc')

  const agRatio = albuminPct != null && globulinPct != null && globulinPct > 0
    ? albuminPct / globulinPct
    : albuminConc != null && globulinConc != null && globulinConc > 0
      ? albuminConc / globulinConc
      : null

  return {
    agRatio: formatDerivedValue(agRatio),
    globulinsPct: formatDerivedValue(globulinPct, '%'),
    globulinsConc: formatDerivedValue(globulinConc, ' g/dL'),
    alphaPct: formatDerivedValue(alphaPct, '%'),
    alphaConc: formatDerivedValue(alphaConc, ' g/dL'),
    betaPct: formatDerivedValue(betaPct, '%'),
    betaConc: formatDerivedValue(betaConc, ' g/dL'),
  }
}

function parseReferenceTargets(targets: Record<FraccionKey, string>): ReferenceFractionTargets | null {
  const parsed = fracciones.reduce<ReferenceFractionTargets>((accumulator, fraccion) => {
    accumulator[fraccion.key] = parseResultNumber(targets[fraccion.key]) ?? 0
    return accumulator
  }, {
    albumina: 0,
    alfa_1: 0,
    alfa_2: 0,
    beta_1: 0,
    beta_2: 0,
    gamma: 0,
  })

  const hasMissingValue = fracciones.some(fraccion => !targets[fraccion.key].trim())
  const total = fracciones.reduce((sum, fraccion) => sum + parsed[fraccion.key], 0)

  if (hasMissingValue || total <= 0) return null
  return parsed
}

function buildReferenceTargetSummary(targets: Record<FraccionKey, string>) {
  const values = fracciones.map(fraccion => parseResultNumber(targets[fraccion.key]))
  const complete = values.every(value => value != null)
  const total = values.reduce<number>((sum, value) => sum + (value ?? 0), 0)

  return {
    complete,
    total,
    withinTolerance: complete && Math.abs(total - 100) <= REFERENCE_TARGET_SUM_TOLERANCE,
  }
}

function formatReferenceTargets(targets: ReferenceFractionTargets) {
  return fracciones.reduce<Record<FraccionKey, string>>((accumulator, fraccion) => {
    accumulator[fraccion.key] = Number.isFinite(targets[fraccion.key])
      ? targets[fraccion.key].toString()
      : ''
    return accumulator
  }, createEmptyReferenceTargets())
}

function isCalibrationPattern(value: unknown): value is CalibrationPattern {
  return CALIBRATION_PATTERN_OPTIONS.some(option => option.value === value)
}

function formatDisplayValue(value: string | null | undefined, fallback = '---') {
  return value && value.trim() ? value : fallback
}

function formatPrintTimestamp(date: Date) {
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function buildPrintFileName(numeroMuestra: string, numeroPaciente: string, analisisId: string) {
  const seed = numeroMuestra.trim() || numeroPaciente.trim() || analisisId || 'analisis-electroforesis'
  return seed.toLowerCase().replace(/[^a-z0-9_-]+/g, '-')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function toNullableCropNumber(value: unknown) {
  if (value == null || value === '') return null
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function normalizeIncomingCrop(crop: FlexibleCropState | CropPayload | null | undefined): CropPayload | null {
  if (!crop) return null

  return {
    izquierda: toNullableCropNumber(crop.izquierda),
    arriba: toNullableCropNumber(crop.arriba),
    ancho: toNullableCropNumber(crop.ancho),
    alto: toNullableCropNumber(crop.alto),
    separacion: toNullableCropNumber(crop.separacion),
  }
}

function sameVals(left: FraccionVals, right: FraccionVals) {
  return fracciones.every(fraccion => (
    left[fraccion.key].pct === right[fraccion.key].pct &&
    left[fraccion.key].conc === right[fraccion.key].conc
  ))
}

function buildValsFromReview(review: ManualReviewData): FraccionVals {
  const next = createEmptyVals()

  for (const fraccion of fracciones) {
    const fraction = review.fractions[fraccion.key]
    next[fraccion.key] = {
      pct: fraction.percentage.toFixed(2),
      conc: fraction.concentration != null ? fraction.concentration.toFixed(2) : '',
    }
  }

  return next
}

function buildValsFromProcessorResult(result: LocalProcessorResult, totalConcentration: number | null): FraccionVals {
  const next = createEmptyVals()

  for (const fraccion of fracciones) {
    const fraction = result.fractions[fraccion.key]
    const percentage = fraction.percentage
    next[fraccion.key] = {
      pct: percentage.toFixed(2),
      conc: totalConcentration != null ? ((percentage * totalConcentration) / 100).toFixed(2) : '',
    }
  }

  return next
}

function sameSeparatorRatios(left: number[], right: number[], tolerance = 0.0005) {
  if (left.length !== right.length) return false
  return left.every((ratio, index) => Math.abs(ratio - right[index]) <= tolerance)
}

function shouldUseProcessorFractions(result: LocalProcessorResult, separatorRatios: number[]) {
  return sameSeparatorRatios(separatorRatios, buildDefaultSeparatorRatios(result))
}

function formatDiagnosticNumber(value: number | null | undefined, digits = 2) {
  if (value == null || !Number.isFinite(value)) return '---'
  return value.toFixed(digits)
}

function formatProfilePosition(index: number, profileLength: number) {
  const denominator = Math.max(profileLength - 1, 1)
  return `${((index / denominator) * 100).toFixed(1)}%`
}

function formatIndexList(indices: number[], profileLength: number) {
  if (indices.length === 0) return '---'
  return indices.map(index => `${index} (${formatProfilePosition(index, profileLength)})`).join(', ')
}

function buildStoredManualReview(review: ManualReviewData, selectedSeparatorIndex: number) {
  return {
    version: 'interactive_review_v1',
    selected_separator: selectedSeparatorIndex,
    separator_ratios: review.separatorRatios.map(ratio => Number(ratio.toFixed(6))),
    total_area: review.totalArea,
    fractions: Object.fromEntries(fracciones.map(fraccion => {
      const fraction = review.fractions[fraccion.key]
      return [fraccion.key, {
        start: fraction.start,
        end: fraction.end,
        peak_index: fraction.peak_index,
        area: fraction.area,
        percentage: fraction.percentage,
        concentration: fraction.concentration,
      }]
    })),
    updated_at: new Date().toISOString(),
  }
}

function buildStoredReferenceCalibration(
  referenceCalibration: ReferenceCalibrationState,
  review: ManualReviewData,
  result: LocalProcessorResult,
  processorMeta: ProcessorMeta,
  selectedSeparatorIndex: number,
) {
  const profileLength = Math.max(result.profile.length, result.profile_length, 1)

  return {
    version: 'pdf_reference_calibration_v1',
    source: referenceCalibration.source,
    pattern: referenceCalibration.pattern,
    selected_separator: selectedSeparatorIndex,
    targets: Object.fromEntries(fracciones.map(fraccion => ([
      fraccion.key,
      roundTo(referenceCalibration.targets[fraccion.key], 4),
    ]))),
    total_target: roundTo(fracciones.reduce((total, fraccion) => total + referenceCalibration.targets[fraccion.key], 0), 4),
    separator_ratios: review.separatorRatios.map(ratio => Number(ratio.toFixed(6))),
    applied_ranges: Object.fromEntries(fracciones.map(fraccion => {
      const fraction = review.fractions[fraccion.key]
      return [fraccion.key, {
        start: fraction.start,
        end: fraction.end,
        start_percent: roundTo((fraction.start / Math.max(profileLength - 1, 1)) * 100, 2),
        end_percent: roundTo((fraction.end / Math.max(profileLength - 1, 1)) * 100, 2),
        area: fraction.area,
        percentage: fraction.percentage,
        concentration: fraction.concentration,
      }]
    })),
    processor_ranges: Object.fromEntries(fracciones.map(fraccion => {
      const fraction = result.fractions[fraccion.key]
      return [fraccion.key, {
        start: fraction.start,
        end: fraction.end,
        start_percent: roundTo((fraction.start / Math.max(profileLength - 1, 1)) * 100, 2),
        end_percent: roundTo((fraction.end / Math.max(profileLength - 1, 1)) * 100, 2),
        area: fraction.area,
        percentage: fraction.percentage,
        concentration: fraction.concentration,
      }]
    })),
    processor_source: processorMeta.source,
    algorithm_version: processorMeta.algorithmVersion,
    calibration_profile: processorMeta.calibrationProfile || null,
    calibration_version: processorMeta.calibrationVersion || null,
    crop_used: result.crop_used,
    axis: result.axis,
    profile_length: result.profile_length,
    total_area: result.total_area,
    peaks: result.peaks,
    valleys: result.valleys,
    updated_at: new Date().toISOString(),
  }
}

function mergeRawResultWithManualReview(
  rawResult: Record<string, unknown> | null,
  review: ManualReviewData | null,
  selectedSeparatorIndex: number,
  referenceCalibration?: ReferenceCalibrationState | null,
  result?: LocalProcessorResult | null,
  processorMeta?: ProcessorMeta,
) {
  const nextRawResult = { ...(rawResult ?? {}) }

  if (review) {
    nextRawResult.manual_review = buildStoredManualReview(review, selectedSeparatorIndex)
  }

  if (referenceCalibration === null) {
    delete nextRawResult.reference_calibration
  } else if (referenceCalibration && review && result && processorMeta) {
    nextRawResult.reference_calibration = buildStoredReferenceCalibration(
      referenceCalibration,
      review,
      result,
      processorMeta,
      selectedSeparatorIndex,
    )
  }

  return nextRawResult
}

function readStoredSeparatorRatios(rawResult: Record<string, unknown> | null, result: LocalProcessorResult) {
  const manualReview = rawResult?.manual_review
  if (isRecord(manualReview) && Array.isArray(manualReview.separator_ratios)) {
    const ratios = manualReview.separator_ratios.filter(isNumber)
    if (ratios.length === REVIEW_SEPARATOR_COUNT) {
      return normalizeSeparatorRatios(ratios, result.profile.length)
    }
  }

  return buildDefaultSeparatorRatios(result)
}

function readStoredSelectedSeparator(rawResult: Record<string, unknown> | null) {
  const manualReview = rawResult?.manual_review
  if (!isRecord(manualReview)) return 1

  const selected = manualReview.selected_separator
  if (!isNumber(selected)) return 1
  return Math.min(Math.max(Math.round(selected), 0), REVIEW_SEPARATOR_COUNT - 1)
}

function readStoredReferenceCalibration(rawResult: Record<string, unknown> | null): ReferenceCalibrationState | null {
  const stored = rawResult?.reference_calibration
  if (!isRecord(stored)) return null

  const targets = stored.targets
  if (!isRecord(targets)) return null

  const parsedTargets = fracciones.reduce<ReferenceFractionTargets>((accumulator, fraccion) => {
    const value = targets[fraccion.key]
    accumulator[fraccion.key] = value == null ? Number.NaN : isNumber(value) ? value : Number(value)
    return accumulator
  }, {
    albumina: 0,
    alfa_1: 0,
    alfa_2: 0,
    beta_1: 0,
    beta_2: 0,
    gamma: 0,
  })

  const hasInvalidTarget = fracciones.some(fraccion => !Number.isFinite(parsedTargets[fraccion.key]))
  if (hasInvalidTarget) return null

  return {
    source: 'pdf_external',
    targets: parsedTargets,
    pattern: isCalibrationPattern(stored.pattern) ? stored.pattern : DEFAULT_CALIBRATION_PATTERN,
  }
}

function readStoredInputImages(rawResult: Record<string, unknown> | null) {
  if (!rawResult || !Array.isArray(rawResult.input_images)) return [] as RawInputImage[]
  return rawResult.input_images.flatMap(image => {
    if (!isRecord(image)) return []
    return [{
      nombre: typeof image.nombre === 'string' ? image.nombre : '',
      tipo: typeof image.tipo === 'string' ? image.tipo : 'otro',
      storage_path: typeof image.storage_path === 'string' ? image.storage_path : null,
      crop: isRecord(image.crop) ? image.crop as CropPayload : null,
    }]
  }) as RawInputImage[]
}

function readLocalProcessor(rawResult: Record<string, unknown> | null) {
  if (!rawResult || !isRecord(rawResult.local_processor)) return null
  return rawResult.local_processor as LocalProcessorResult
}

function readProcessorMode(): ProcessorMode {
  if (!ANALYSIS_API_ENABLED || typeof window === 'undefined') return 'local'
  const value = window.localStorage.getItem(PROCESSOR_MODE_STORAGE_KEY)
  return value === 'local' ? 'local' : 'auto'
}

function readBackendStatus(): BackendStatus {
  if (!ANALYSIS_API_ENABLED) return 'disabled'
  if (typeof window === 'undefined') return 'unknown'
  const value = window.sessionStorage.getItem(BACKEND_STATUS_STORAGE_KEY)
  if (value === 'available' || value === 'unavailable') return value
  return 'unknown'
}

function readStoredBackendStatus(rawResult: Record<string, unknown> | null): BackendStatus {
  if (!ANALYSIS_API_ENABLED) return 'disabled'
  if (!rawResult) return 'unknown'
  const storedStatus = rawResult.backend_status
  if (storedStatus === 'disabled' || storedStatus === 'available' || storedStatus === 'unavailable') return storedStatus

  const source = readProcessorSource(rawResult)
  const fallbackDetail = readStringField(rawResult, 'backend_fallback_detail')
  if (source === 'backend_fastapi') return 'available'
  if (source === 'frontend_local_fallback' && fallbackDetail) return 'unavailable'
  return 'unknown'
}

function resolveRuntimeBackendStatus(currentStatus: BackendStatus, rawResult: Record<string, unknown> | null): BackendStatus {
  if (!ANALYSIS_API_ENABLED) return 'disabled'

  const storedStatus = readStoredBackendStatus(rawResult)
  if (storedStatus === 'available') return 'available'

  // Un estudio viejo procesado con fallback no debe bloquear nuevos intentos al backend.
  return currentStatus === 'disabled' ? 'unknown' : currentStatus
}

function readProcessorSource(rawResult: Record<string, unknown> | null): ProcessorSource | null {
  if (!rawResult) return null
  const source = rawResult.processor_source
  return source === 'backend_fastapi' || source === 'frontend_local_fallback' ? source : null
}

function readStringField(rawResult: Record<string, unknown> | null, key: string) {
  if (!rawResult) return ''
  const value = rawResult[key]
  return typeof value === 'string' ? value : ''
}

function readProcessorMeta(rawResult: Record<string, unknown> | null): ProcessorMeta {
  return {
    source: readProcessorSource(rawResult),
    algorithmVersion: readStringField(rawResult, 'algorithm_version'),
    calibrationProfile: readStringField(rawResult, 'calibration_profile'),
    calibrationVersion: readStringField(rawResult, 'calibration_version'),
    backendFallbackDetail: readStringField(rawResult, 'backend_fallback_detail'),
  }
}

function processorSourceLabel(source: ProcessorSource | null) {
  if (source === 'backend_fastapi') return 'Backend FastAPI'
  if (source === 'frontend_local_fallback') return 'Respaldo local'
  return 'Sin procesar'
}

function backendStatusLabel(status: BackendStatus) {
  if (status === 'disabled') return 'Deshabilitado por configuracion'
  if (status === 'available') return 'Disponible'
  if (status === 'unavailable') return 'No disponible en esta sesion'
  return 'Sin verificar'
}

function findCropForImage(image: ImagePreview, storedImages: RawInputImage[]) {
  if (image.draftCrop) return image.draftCrop
  const byStorage = storedImages.find(stored => stored.storage_path && image.storagePath && stored.storage_path === image.storagePath)
  if (byStorage?.crop) return byStorage.crop
  return storedImages.find(stored => stored.nombre === image.nombre)?.crop ?? null
}

function normalizeIncomingImages(images: IncomingImageState[] | undefined): ImagePreview[] {
  if (!Array.isArray(images)) return []

  return images.flatMap(image => {
    if (!image?.preview) return []
    return [{
      preview: image.preview,
      processingPreview: image.preview,
      tipo: image.tipo ?? 'otro',
      nombre: image.nombre ?? 'Archivo sin nombre',
      storagePath: image.storagePath,
      draftCrop: normalizeIncomingCrop(image.crop),
    }]
  })
}

const DENSITOGRAM_X_VISUAL_SCALE = 0.74

function compactDensitogramX(x: number, index: number, lastIndex: number) {
  if (index === 0) return 0
  if (index === lastIndex) return 1
  return 0.5 + (x - 0.5) * DENSITOGRAM_X_VISUAL_SCALE
}

function restoreDensitogramX(displayX: number) {
  return Math.min(Math.max(0.5 + (displayX - 0.5) / DENSITOGRAM_X_VISUAL_SCALE, 0), 1)
}

function buildDensitogramDisplayY(y: number, index: number, lastIndex: number) {
  if (index === 0) return 0
  if (index === lastIndex) return 0
  return Math.min(Math.max(y, 0), 1)
}

function buildDensitogramDisplayProfile(profile: LocalProcessorResult['profile']) {
  const lastIndex = Math.max(profile.length - 1, 0)
  return profile.map((point, index) => ({
    ...point,
    x: compactDensitogramX(point.x, index, lastIndex),
    y: buildDensitogramDisplayY(point.y, index, lastIndex),
  }))
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl p-5" style={{ background: 'linear-gradient(160deg, #FBFBFC, #FAF9FB)', border: '1px solid #DFE0E5', boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
      <p className="text-sm font-semibold mb-4" style={{ color: '#5C894A' }}>{title}</p>
      {children}
    </section>
  )
}

function ProfileChart({
  result,
  meta,
  review,
  selectedSeparatorIndex,
  onSelectSeparator,
  onAdjustSeparator,
  onResetSeparators,
}: {
  result: LocalProcessorResult
  meta: ProcessorMeta
  review: ManualReviewData
  selectedSeparatorIndex: number
  onSelectSeparator: (index: number) => void
  onAdjustSeparator: (index: number, nextRatio: number) => void
  onResetSeparators: () => void
}) {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [draggingSeparatorIndex, setDraggingSeparatorIndex] = useState<number | null>(null)

  const chartWidth = 1000
  const chartHeight = 312
  const plotLeft = 64
  const plotTop = 24
  const plotWidth = 900
  const plotHeight = 228
  const plotBottom = plotTop + plotHeight
  const xAxisLabelY = plotBottom + 18
  const yAxisLabelX = plotLeft - 12
  const selectedSeparator = review.separators[selectedSeparatorIndex] ?? review.separators[0]
  const pointStep = 1 / Math.max(result.profile.length - 1, 1)
  const majorStep = pointStep * 6
  const defaultRatios = buildDefaultSeparatorRatios(result)
  const hasManualAdjustments = review.separatorRatios.some((ratio, index) => (
    Math.abs(ratio - (defaultRatios[index] ?? 0)) > 0.0005
  ))
  const selectedSeparatorLocked = selectedSeparatorIndex === 0 || selectedSeparatorIndex === review.separators.length - 1

  const chartTitle = meta.source === 'backend_fastapi' ? 'Perfil procesado' : 'Perfil estimado'
  const footer = meta.source === 'backend_fastapi'
    ? `Procesado con ${processorSourceLabel(meta.source)}${meta.calibrationProfile ? ` (${meta.calibrationProfile}${meta.calibrationVersion ? ` ${meta.calibrationVersion}` : ''})` : ''}. Requiere revision profesional.`
    : 'Procesamiento local preliminar. Requiere revision profesional.'

  const displayProfile = buildDensitogramDisplayProfile(result.profile)
  const points = displayProfile.map(point => `${(plotLeft + point.x * plotWidth).toFixed(1)},${(plotBottom - point.y * plotHeight).toFixed(1)}`).join(' ')

  function toSvgRatio(event: React.PointerEvent<SVGSVGElement | SVGLineElement | SVGCircleElement>) {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return null

    const x = ((event.clientX - rect.left) / rect.width) * chartWidth
    const displayRatio = Math.min(Math.max((x - plotLeft) / plotWidth, 0), 1)
    return restoreDensitogramX(displayRatio)
  }

  function startDragging(index: number, event: React.PointerEvent<SVGLineElement | SVGCircleElement>) {
    if (index === 0 || index === review.separators.length - 1) return
    event.preventDefault()
    onSelectSeparator(index)
    setDraggingSeparatorIndex(index)
  }

  function stopDragging() {
    setDraggingSeparatorIndex(null)
  }

  function handlePointerMove(event: React.PointerEvent<SVGSVGElement>) {
    if (draggingSeparatorIndex == null) return
    const nextRatio = toSvgRatio(event)
    if (nextRatio == null) return
    onAdjustSeparator(draggingSeparatorIndex, nextRatio)
  }

  return (
    <div className="mt-4 rounded-xl p-3" style={{ background: '#FFFFFF', border: '1px solid #DFE0E5' }}>
      <div className="flex items-center justify-between gap-3 mb-3">
        <span className="text-xs font-semibold" style={{ color: '#5C894A' }}>{chartTitle}</span>
        <div className="flex items-center gap-2 text-[11px]" style={{ color: '#54585E' }}>
          <span>{result.detected_peaks} picos</span>
          {hasManualAdjustments && (
            <span className="rounded-full px-2 py-1 font-semibold" style={{ background: '#F0FDF4', color: '#15803D' }}>
              Revision manual activa
            </span>
          )}
        </div>
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
        className="w-full h-72 rounded-lg"
        style={{ background: '#F6F7F8', touchAction: 'none', cursor: draggingSeparatorIndex != null ? 'ew-resize' : 'default' }}
        onPointerMove={handlePointerMove}
        onPointerUp={stopDragging}
        onPointerLeave={stopDragging}
        onPointerCancel={stopDragging}
      >
        {Array.from({ length: 6 }, (_, index) => {
          const ratio = index / 5
          const y = plotTop + ratio * plotHeight
          const value = (1 - ratio).toFixed(2)
          return (
            <g key={`y-axis-${index}`}>
              <line x1={plotLeft - 6} x2={plotLeft} y1={y} y2={y} stroke="#AAB3BC" strokeWidth="1.2" />
              <text x={yAxisLabelX} y={y + 4} textAnchor="end" fontSize="11" fill="#6B7178">
                {value}
              </text>
            </g>
          )
        })}
        {Array.from({ length: 11 }, (_, index) => {
          const ratio = index / 10
          const x = plotLeft + ratio * plotWidth
          return (
            <g key={`x-axis-${index}`}>
              <line x1={x} x2={x} y1={plotBottom} y2={plotBottom + 6} stroke="#AAB3BC" strokeWidth="1.2" />
              <text x={x} y={xAxisLabelY} textAnchor="middle" fontSize="11" fill="#6B7178">
                {Math.round(ratio * 100)}%
              </text>
            </g>
          )
        })}

        {Array.from({ length: 6 }, (_, index) => {
          const y = plotTop + (index / 5) * plotHeight
          return <line key={`h-${index}`} x1={plotLeft} x2={plotLeft + plotWidth} y1={y} y2={y} stroke="#DCE0E5" strokeWidth="1" opacity="0.8" />
        })}
        {Array.from({ length: 11 }, (_, index) => {
          const x = plotLeft + (index / 10) * plotWidth
          return <line key={`v-${index}`} x1={x} x2={x} y1={plotTop} y2={plotBottom} stroke="#E3E6EA" strokeWidth="1" opacity="0.8" />
        })}

        {fracciones.map((fraccion, index) => {
          const fraction = review.fractions[fraccion.key]
          const segmentColor = REVIEW_SEPARATOR_DEFS[index]?.color ?? '#94BB66'
          const startPoint = displayProfile[fraction.start]
          const endPoint = displayProfile[fraction.end]
          const segmentPoints = displayProfile.slice(fraction.start, fraction.end + 1)

          if (!startPoint || !endPoint || segmentPoints.length === 0) return null

          const polygonPoints = [
            `${(plotLeft + startPoint.x * plotWidth).toFixed(1)},${plotBottom.toFixed(1)}`,
            ...segmentPoints.map(point => `${(plotLeft + point.x * plotWidth).toFixed(1)},${(plotBottom - point.y * plotHeight).toFixed(1)}`),
            `${(plotLeft + endPoint.x * plotWidth).toFixed(1)},${plotBottom.toFixed(1)}`,
          ].join(' ')

          const isSelectedSegment = selectedSeparatorIndex === index || selectedSeparatorIndex === index + 1

          return (
            <polygon
              key={`area-${fraccion.key}`}
              points={polygonPoints}
              fill={segmentColor}
              opacity={isSelectedSegment ? 0.24 : 0.12}
              stroke="none"
            />
          )
        })}

        <rect x={plotLeft} y={plotTop} width={plotWidth} height={plotHeight} fill="none" stroke="#CED4DA" strokeWidth="1.5" rx="8" />
        <text x={plotLeft + plotWidth / 2} y={chartHeight - 8} textAnchor="middle" fontSize="11" fontWeight="600" fill="#54585E">
          Recorrido del densitograma
        </text>
        <text
          x={18}
          y={plotTop + plotHeight / 2}
          textAnchor="middle"
          fontSize="11"
          fontWeight="600"
          fill="#54585E"
          transform={`rotate(-90 18 ${plotTop + plotHeight / 2})`}
        >
          Intensidad normalizada
        </text>
        <polyline fill="none" stroke="#161616" strokeWidth="1" strokeLinejoin="round" strokeLinecap="round" points={points} />

        {review.separators.map((separator, index) => {
          const displayX = displayProfile[separator.index]?.x ?? compactDensitogramX(separator.x, separator.index, result.profile.length - 1)
          const x = plotLeft + displayX * plotWidth
          const isSelected = index === selectedSeparatorIndex
          const isLocked = index === 0 || index === review.separators.length - 1
          const displayY = isLocked ? 0 : separator.y
          const y = plotBottom - displayY * plotHeight

          return (
            <g key={separator.id}>
              <line
                x1={x}
                x2={x}
                y1={isLocked ? y : plotTop}
                y2={plotBottom}
                stroke={separator.color}
                strokeWidth={isSelected ? 1 : 1.5}
                strokeDasharray={isLocked || isSelected ? '0' : '7 5'}
                opacity="0.95"
              />
              <line
                x1={x}
                x2={x}
                y1={isLocked ? y : plotTop}
                y2={plotBottom}
                stroke="transparent"
                strokeWidth="1"
                style={{ cursor: isLocked ? 'pointer' : 'ew-resize' }}
                onClick={() => onSelectSeparator(index)}
                onPointerDown={event => startDragging(index, event)}
              />
              <circle
                cx={x}
                cy={y}
                r={isSelected ? 7.5 : 5.5}
                fill={separator.color}
                stroke="#FFFFFF"
                strokeWidth="1"
                style={{ cursor: isLocked ? 'pointer' : 'ew-resize' }}
                onPointerDown={event => startDragging(index, event)}
                onClick={() => onSelectSeparator(index)}
              />
              <text
                x={x}
                y={12}
                textAnchor="middle"
                fontSize="11"
                fontWeight="700"
                fill={separator.color}
              >
                {index + 1}
              </text>
            </g>
          )
        })}
      </svg>

      <div className="mt-4 grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_300px] gap-4">
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-2">
            {review.separators.map((separator, index) => {
              const isSelected = index === selectedSeparatorIndex
              return (
                <button
                  key={separator.id}
                  type="button"
                  onClick={() => onSelectSeparator(index)}
                  className="rounded-lg px-3 py-2 text-left text-xs transition"
                  style={isSelected
                    ? { border: `1px solid ${separator.color}`, background: '#FFFFFF', boxShadow: `0 0 0 2px ${separator.color}22`, color: '#54585E' }
                    : { border: '1px solid #DFE0E5', background: '#FBFBFC', color: '#54585E' }}
                >
                  <div className="flex items-center gap-2">
                    <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: separator.color }} />
                    <span className="font-semibold">{separator.label}</span>
                  </div>
                  <p className="hidden mt-1 text-[11px]" style={{ color: '#6B7178' }}>
                    X {(separator.x * 100).toFixed(1)}% | Y {separator.y.toFixed(3)}
                  </p>
                  <p className="hiddenmt-1 text-[10px] font-medium" style={{ color: index === 0 || index === review.separators.length - 1 ? '#A06A00' : '#5C894A' }}>
                    {index === 0 || index === review.separators.length - 1 ? 'Linea fija' : 'Minimo editable'}
                  </p>
                </button>
              )
            })}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {fracciones.map(fraccion => {
              const fraction = review.fractions[fraccion.key]
              const fractionColor = REVIEW_SEPARATOR_DEFS[fracciones.findIndex(item => item.key === fraccion.key)]?.color ?? '#94BB66'
              return (
                <div key={fraccion.key} className="rounded-xl px-3 py-2" style={{ background: '#FBFBFC', border: '1px solid #DFE0E5' }}>
                  <div className="flex items-center gap-2">
                    <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: fractionColor }} />
                    <p className="text-[11px]" style={{ color: '#54585E' }}>{fraccion.label}</p>
                  </div>
                  <p className="text-sm font-semibold mt-1" style={{ color: '#5C894A' }}>{fraction.percentage.toFixed(2)}%</p>
                  <p className="text-[11px] mt-1 hidden" style={{ color: '#6B7178' }}>Area {fraction.area.toFixed(4)}</p>
                </div>
              )
            })}
          </div>
        </div>

        <div className="rounded-xl p-4" style={{ background: '#FBFBFC', border: '1px solid #DFE0E5' }}>
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <p className="text-xs font-semibold" style={{ color: '#5C894A' }}>Trabajar con el minimo seleccionado</p>
              <p className="text-[11px] mt-1 hidden" style={{ color: '#54585E' }}>
                El eje Y se recalcula sobre la curva cuando moves la linea. Las lineas de Inicio y Fin quedan fijas.
              </p>
            </div>
            <button
              type="button"
              onClick={onResetSeparators}
              className="rounded-lg px-3 py-2 text-[11px] font-medium transition"
              style={{ background: '#FFFFFF', color: '#54585E', border: '1px solid #DFE0E5' }}
            >
              Restablecer
            </button>
          </div>

          <div className="rounded-xl px-3 py-3 mb-3" style={{ background: '#FFFFFF', border: '1px solid #DFE0E5' }}>
            <div className="flex items-center gap-2">
              <span className="inline-block w-3 h-3 rounded-full" style={{ background: selectedSeparator.color }} />
              <span className="text-sm font-semibold" style={{ color: '#54585E' }}>{selectedSeparator.label}</span>
            </div>
            <div className="grid grid-cols-3 gap-2 mt-3 text-[11px]">
              <div className="rounded-lg px-2 py-2" style={{ background: '#FBFBFC', border: '1px solid #DFE0E5' }}>
                <p style={{ color: '#6B7178' }}>Posicion X</p>
                <p className="mt-1 font-semibold" style={{ color: '#5C894A' }}>{(selectedSeparator.x * 100).toFixed(2)}%</p>
              </div>
              <div className="rounded-lg px-2 py-2" style={{ background: '#FBFBFC', border: '1px solid #DFE0E5' }}>
                <p style={{ color: '#6B7178' }}>Nivel Y</p>
                <p className="mt-1 font-semibold" style={{ color: '#5C894A' }}>{selectedSeparator.y.toFixed(4)}</p>
              </div>
              <div className="rounded-lg px-2 py-2" style={{ background: '#FBFBFC', border: '1px solid #DFE0E5' }}>
                <p style={{ color: '#6B7178' }}>Indice</p>
                <p className="mt-1 font-semibold" style={{ color: '#5C894A' }}>{selectedSeparator.index + 1}</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2 mb-3">
            {[
              { label: '-6', delta: -majorStep },
              { label: '-1', delta: -pointStep },
              { label: '+1', delta: pointStep },
              { label: '+6', delta: majorStep },
            ].map(control => (
              <button
                key={control.label}
                type="button"
                onClick={() => onAdjustSeparator(selectedSeparatorIndex, selectedSeparator.ratio + control.delta)}
                disabled={selectedSeparatorLocked}
                className="rounded-lg px-2 py-2 text-xs font-semibold transition disabled:opacity-50"
                style={{ background: '#FFFFFF', color: '#54585E', border: '1px solid #DFE0E5' }}
              >
                {control.label}
              </button>
            ))}
          </div>

          <input
            type="range"
            min={selectedSeparatorIndex === 0 ? 0 : review.separators[selectedSeparatorIndex - 1].ratio * 100}
            max={selectedSeparatorIndex === review.separators.length - 1 ? 100 : review.separators[selectedSeparatorIndex + 1].ratio * 100}
            step={Math.max(pointStep * 100, 0.1)}
            value={selectedSeparator.ratio * 100}
            onChange={event => onAdjustSeparator(selectedSeparatorIndex, Number(event.target.value) / 100)}
            disabled={selectedSeparatorLocked}
            className="w-full"
          />

          <p className="text-[11px] mt-3 hidden" style={{ color: '#54585E' }}>
            Tambien podes arrastrar directamente cada linea interna sobre el grafico. La tabla y las areas sombreadas se recalculan con la delimitacion actual.
          </p>
        </div>
      </div>

      <p className="text-[11px] mt-3" style={{ color: '#54585E' }}>{footer}</p>
    </div>
  )
}

function PrintableProfileChart({
  result,
  review,
  meta,
}: {
  result: LocalProcessorResult
  review: ManualReviewData
  meta: ProcessorMeta
}) {
  const chartWidth = 1000
  const chartHeight = 276
  const plotLeft = 64
  const plotTop = 20
  const plotWidth = 900
  const plotHeight = 190
  const plotBottom = plotTop + plotHeight
  const xAxisLabelY = plotBottom + 18
  const yAxisLabelX = plotLeft - 12
  const displayProfile = buildDensitogramDisplayProfile(result.profile)
  const points = displayProfile.map(point => `${(plotLeft + point.x * plotWidth).toFixed(1)},${(plotBottom - point.y * plotHeight).toFixed(1)}`).join(' ')
  const subtitle = meta.source === 'backend_fastapi'
    ? `Procesado con ${processorSourceLabel(meta.source)}${meta.calibrationProfile ? ` (${meta.calibrationProfile}${meta.calibrationVersion ? ` ${meta.calibrationVersion}` : ''})` : ''}`
    : 'Procesamiento local preliminar'

  return (
    <div className="rounded-2xl p-4" style={{ background: 'linear-gradient(160deg, #FBFBFC, #FAF9FB)', border: '1px solid #DFE0E5' }}>
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <p className="text-sm font-semibold" style={{ color: '#5C894A' }}>Densitograma</p>
          <p className="text-[11px] mt-1" style={{ color: '#6B7178' }}>{subtitle}</p>
        </div>
        <div className="text-right text-[11px]" style={{ color: '#54585E' }}>
          <p>{result.detected_peaks} picos detectados</p>
          {result.warning && <p className="mt-1" style={{ color: '#A06A00' }}>{result.warning}</p>}
        </div>
      </div>

      <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full rounded-xl" style={{ background: '#F6F7F8' }}>
        {Array.from({ length: 6 }, (_, index) => {
          const ratio = index / 5
          const y = plotTop + ratio * plotHeight
          const value = (1 - ratio).toFixed(2)
          return (
            <g key={`print-y-axis-${index}`}>
              <line x1={plotLeft - 6} x2={plotLeft} y1={y} y2={y} stroke="#AAB3BC" strokeWidth="1.2" />
              <text x={yAxisLabelX} y={y + 4} textAnchor="end" fontSize="11" fill="#6B7178">
                {value}
              </text>
            </g>
          )
        })}

        {Array.from({ length: 11 }, (_, index) => {
          const ratio = index / 10
          const x = plotLeft + ratio * plotWidth
          return (
            <g key={`print-x-axis-${index}`}>
              <line x1={x} x2={x} y1={plotBottom} y2={plotBottom + 6} stroke="#AAB3BC" strokeWidth="1.2" />
              <text x={x} y={xAxisLabelY} textAnchor="middle" fontSize="11" fill="#6B7178">
                {Math.round(ratio * 100)}%
              </text>
            </g>
          )
        })}

        {Array.from({ length: 6 }, (_, index) => {
          const y = plotTop + (index / 5) * plotHeight
          return <line key={`print-h-${index}`} x1={plotLeft} x2={plotLeft + plotWidth} y1={y} y2={y} stroke="#DCE0E5" strokeWidth="1" opacity="0.85" />
        })}

        {Array.from({ length: 11 }, (_, index) => {
          const x = plotLeft + (index / 10) * plotWidth
          return <line key={`print-v-${index}`} x1={x} x2={x} y1={plotTop} y2={plotBottom} stroke="#E3E6EA" strokeWidth="1" opacity="0.85" />
        })}

        {fracciones.map((fraccion, index) => {
          const fraction = review.fractions[fraccion.key]
          const segmentColor = REVIEW_SEPARATOR_DEFS[index]?.color ?? '#94BB66'
          const startPoint = displayProfile[fraction.start]
          const endPoint = displayProfile[fraction.end]
          const segmentPoints = displayProfile.slice(fraction.start, fraction.end + 1)

          if (!startPoint || !endPoint || segmentPoints.length === 0) return null

          const polygonPoints = [
            `${(plotLeft + startPoint.x * plotWidth).toFixed(1)},${plotBottom.toFixed(1)}`,
            ...segmentPoints.map(point => `${(plotLeft + point.x * plotWidth).toFixed(1)},${(plotBottom - point.y * plotHeight).toFixed(1)}`),
            `${(plotLeft + endPoint.x * plotWidth).toFixed(1)},${plotBottom.toFixed(1)}`,
          ].join(' ')

          return (
            <polygon
              key={`print-area-${fraccion.key}`}
              points={polygonPoints}
              fill={segmentColor}
              opacity={0.18}
              stroke="none"
            />
          )
        })}

        <rect x={plotLeft} y={plotTop} width={plotWidth} height={plotHeight} fill="none" stroke="#CED4DA" strokeWidth="1.5" rx="8" />
        <text x={plotLeft + plotWidth / 2} y={chartHeight - 10} textAnchor="middle" fontSize="11" fontWeight="600" fill="#54585E">
          Recorrido del densitograma
        </text>
        <text
          x={18}
          y={plotTop + plotHeight / 2}
          textAnchor="middle"
          fontSize="11"
          fontWeight="600"
          fill="#54585E"
          transform={`rotate(-90 18 ${plotTop + plotHeight / 2})`}
        >
          Intensidad normalizada
        </text>
        <polyline fill="none" stroke="#292929" strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" points={points} />

        {review.separators.map((separator, index) => {
          const displayX = displayProfile[separator.index]?.x ?? compactDensitogramX(separator.x, separator.index, result.profile.length - 1)
          const x = plotLeft + displayX * plotWidth
          const isLocked = index === 0 || index === review.separators.length - 1
          const displayY = isLocked ? 0 : separator.y
          const y = plotBottom - displayY * plotHeight

          return (
            <g key={`print-separator-${separator.id}`}>
              <line
                x1={x}
                x2={x}
                y1={isLocked ? y : plotTop}
                y2={plotBottom}
                stroke={separator.color}
                strokeWidth={index === 0 || index === review.separators.length - 1 ? 3.5 : 2.5}
                strokeDasharray={index === 0 || index === review.separators.length - 1 ? '0' : '7 5'}
                opacity="0.95"
              />
              <circle cx={x} cy={y} r={5.5} fill={separator.color} stroke="#FFFFFF" strokeWidth="2.5" />
              <text x={x} y={13} textAnchor="middle" fontSize="11" fontWeight="700" fill={separator.color}>
                {index + 1}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

export default function NuevoAnalisisPage() {
  const [searchParams] = useSearchParams()
  const pacienteId = searchParams.get('paciente_id') ?? ''
  const analisisId = searchParams.get('analisis_id') ?? ''
  const navigate = useNavigate()
  const location = useLocation()

  const [images, setImages] = useState<ImagePreview[]>(() => normalizeIncomingImages(location.state?.images as IncomingImageState[] | undefined))
  const [numeroPlaca, setNumeroPlaca] = useState('')
  const [numeroMuestra, setNumeroMuestra] = useState('')
  const [numeroPaciente, setNumeroPaciente] = useState('')
  const [cantidadPicos, setCantidadPicos] = useState('')
  const [concTotal, setConcTotal] = useState('')
  const [vals, setVals] = useState<FraccionVals>(createEmptyVals())
  const [referenceTargets, setReferenceTargets] = useState<Record<FraccionKey, string>>(createEmptyReferenceTargets)
  const [referenceCalibration, setReferenceCalibration] = useState<ReferenceCalibrationState | null>(null)
  const [referenceCalibrationPattern, setReferenceCalibrationPattern] = useState<CalibrationPattern>(DEFAULT_CALIBRATION_PATTERN)
  const [observaciones, setObservaciones] = useState('')
  const [rawResult, setRawResult] = useState<Record<string, unknown> | null>(null)
  const [processorResult, setProcessorResult] = useState<LocalProcessorResult | null>(null)
  const [processorMeta, setProcessorMeta] = useState<ProcessorMeta>(emptyProcessorMeta)
  const [separatorRatios, setSeparatorRatios] = useState<number[] | null>(null)
  const [selectedSeparatorIndex, setSelectedSeparatorIndex] = useState(1)
  const [manualReview, setManualReview] = useState<ManualReviewData | null>(null)
  const [processorMode, setProcessorMode] = useState<ProcessorMode>(() => readProcessorMode())
  const [backendStatus, setBackendStatus] = useState<BackendStatus>(() => readBackendStatus())
  const [loadingExisting, setLoadingExisting] = useState(Boolean(analisisId))
  const [saving, setSaving] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const printTimestamp = formatPrintTimestamp(new Date())
  const printableImages = images.filter(image => image.preview).slice(0, 2)
  const derivedAnalysisValues = buildDerivedAnalysisValues(vals)
  const referenceTargetSummary = buildReferenceTargetSummary(referenceTargets)
  const usingProcessorFractions = processorResult && separatorRatios
    ? shouldUseProcessorFractions(processorResult, separatorRatios)
    : false

  function handleFraccion(key: FraccionKey, value: string) {
    setVals(current => ({ ...current, [key]: { pct: value, conc: calculateConcentration(value, concTotal) } }))
  }

  function handleReferenceTarget(key: FraccionKey, value: string) {
    setReferenceTargets(current => ({ ...current, [key]: value }))
    setReferenceCalibration(null)
  }

  function handleReferenceCalibrationPattern(value: string) {
    const nextPattern = isCalibrationPattern(value) ? value : DEFAULT_CALIBRATION_PATTERN
    setReferenceCalibrationPattern(nextPattern)
    setReferenceCalibration(null)
  }

  function handleApplyReferenceCalibration() {
    if (!processorResult) {
      setError('Primero procesa la muestra para poder calibrar contra valores de referencia.')
      return
    }

    const targets = parseReferenceTargets(referenceTargets)
    if (!targets) {
      setError('Completa los porcentajes de referencia de las 6 fracciones antes de aplicar la calibracion.')
      return
    }
    const targetSummary = buildReferenceTargetSummary(referenceTargets)
    if (!targetSummary.withinTolerance) {
      setError(`La suma de porcentajes del PDF debe estar entre ${(100 - REFERENCE_TARGET_SUM_TOLERANCE).toFixed(0)}% y ${(100 + REFERENCE_TARGET_SUM_TOLERANCE).toFixed(0)}%. Suma actual: ${targetSummary.total.toFixed(2)}%. Revisar transcripcion antes de calibrar.`)
      return
    }

    setError('')
    setSelectedSeparatorIndex(1)
    setSeparatorRatios(buildReferenceSeparatorRatios(processorResult, targets))
    setReferenceCalibration({ source: 'pdf_external', targets, pattern: referenceCalibrationPattern })
    setSuccess('Separadores ajustados contra los valores de referencia. Revisar la curva antes de guardar.')
  }

  function handleUseCurrentFractionsAsReference() {
    setReferenceCalibration(null)
    setReferenceTargets(fracciones.reduce<Record<FraccionKey, string>>((accumulator, fraccion) => {
      accumulator[fraccion.key] = vals[fraccion.key].pct
      return accumulator
    }, createEmptyReferenceTargets()))
  }

  function handlePrint() {
    if (typeof window === 'undefined') return
    const previousTitle = document.title
    document.title = buildPrintFileName(numeroMuestra, numeroPaciente, analisisId)
    window.print()
    window.setTimeout(() => {
      document.title = previousTitle
    }, 300)
  }

  function buildAnalysisPayload(userId: string | null, nextRawResult: Record<string, unknown>, nextVals: FraccionVals = vals, nextCantidadPicos: string = cantidadPicos) {
    const hasResultados = fracciones.some(fraccion => nextVals[fraccion.key].pct.trim() !== '')
    return {
      paciente_id: pacienteId,
      numero_placa: numeroPlaca || null,
      numero_muestra: numeroMuestra || null,
      numero_paciente: numeroPaciente || null,
      cantidad_picos: nextCantidadPicos ? parseInt(nextCantidadPicos, 10) : null,
      concentracion_total: concTotal ? parseFloat(concTotal) : null,
      observaciones_generales: observaciones || null,
      estado: hasResultados ? 'procesado' : 'pendiente',
      created_by: userId ?? null,
      albumina_porcentaje: nextVals.albumina.pct ? parseFloat(nextVals.albumina.pct) : null,
      albumina_concentracion: nextVals.albumina.conc ? parseFloat(nextVals.albumina.conc) : null,
      alfa_1_porcentaje: nextVals.alfa_1.pct ? parseFloat(nextVals.alfa_1.pct) : null,
      alfa_1_concentracion: nextVals.alfa_1.conc ? parseFloat(nextVals.alfa_1.conc) : null,
      alfa_2_porcentaje: nextVals.alfa_2.pct ? parseFloat(nextVals.alfa_2.pct) : null,
      alfa_2_concentracion: nextVals.alfa_2.conc ? parseFloat(nextVals.alfa_2.conc) : null,
      beta_1_porcentaje: nextVals.beta_1.pct ? parseFloat(nextVals.beta_1.pct) : null,
      beta_1_concentracion: nextVals.beta_1.conc ? parseFloat(nextVals.beta_1.conc) : null,
      beta_2_porcentaje: nextVals.beta_2.pct ? parseFloat(nextVals.beta_2.pct) : null,
      beta_2_concentracion: nextVals.beta_2.conc ? parseFloat(nextVals.beta_2.conc) : null,
      gamma_porcentaje: nextVals.gamma.pct ? parseFloat(nextVals.gamma.pct) : null,
      gamma_concentracion: nextVals.gamma.conc ? parseFloat(nextVals.gamma.conc) : null,
      resultado_crudo: nextRawResult,
    }
  }

  function handleAdjustSeparator(index: number, nextRatio: number) {
    if (!processorResult) return
    if (index <= 0 || index >= REVIEW_SEPARATOR_COUNT - 1) return

    setSelectedSeparatorIndex(index)
    setSeparatorRatios(current => snapSeparatorRatio(
      processorResult,
      current ?? buildDefaultSeparatorRatios(processorResult),
      index,
      nextRatio,
    ))
  }

  function handleResetSeparators() {
    if (!processorResult) return
    setSeparatorRatios(buildDefaultSeparatorRatios(processorResult))
    setReferenceCalibration(null)
  }

  useEffect(() => {
    setVals(current => {
      let changed = false
      const next = { ...current }
      for (const fraccion of fracciones) {
        const computed = calculateConcentration(current[fraccion.key].pct, concTotal)
        if (next[fraccion.key].conc !== computed) {
          next[fraccion.key] = { ...next[fraccion.key], conc: computed }
          changed = true
        }
      }
      return changed ? next : current
    })
  }, [concTotal])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(PROCESSOR_MODE_STORAGE_KEY, processorMode)
  }, [processorMode])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.sessionStorage.setItem(BACKEND_STATUS_STORAGE_KEY, backendStatus)
  }, [backendStatus])

  useEffect(() => {
    if (!processorResult || !separatorRatios) {
      setManualReview(null)
      return
    }

    const totalConcentration = parseTotalConcentration(concTotal)
    const nextReview = buildManualReviewData(
      processorResult,
      separatorRatios,
      totalConcentration,
    )
    const nextVals = shouldUseProcessorFractions(processorResult, separatorRatios)
      ? buildValsFromProcessorResult(processorResult, totalConcentration)
      : buildValsFromReview(nextReview)

    setManualReview(nextReview)
    setVals(current => sameVals(current, nextVals) ? current : nextVals)
  }, [processorResult, separatorRatios, concTotal])

  useEffect(() => {
    async function hydrate() {
      if (!analisisId) { setLoadingExisting(false); return }
      setLoadingExisting(true)
      setError('')
      const { data: analisis, error: analisisError } = await supabase
        .from('analisis_electroforesis')
        .select('id,numero_placa,numero_muestra,numero_paciente,cantidad_picos,concentracion_total,observaciones_generales,albumina_porcentaje,albumina_concentracion,alfa_1_porcentaje,alfa_1_concentracion,alfa_2_porcentaje,alfa_2_concentracion,beta_1_porcentaje,beta_1_concentracion,beta_2_porcentaje,beta_2_concentracion,gamma_porcentaje,gamma_concentracion,resultado_crudo')
        .eq('id', analisisId)
        .returns<AnalisisRow[]>()
        .single()
      if (analisisError || !analisis) { setError(analisisError?.message ?? 'No se pudo cargar el analisis.'); setLoadingExisting(false); return }

      const storedRawResult = analisis.resultado_crudo ?? null
      const storedProcessorResult = readLocalProcessor(storedRawResult)
      const storedSeparatorRatios = storedProcessorResult ? readStoredSeparatorRatios(storedRawResult, storedProcessorResult) : null
      const storedSelectedSeparator = readStoredSelectedSeparator(storedRawResult)
      const storedReferenceCalibration = readStoredReferenceCalibration(storedRawResult)
      const storedInputImages = readStoredInputImages(storedRawResult)

      setNumeroPlaca(analisis.numero_placa ?? '')
      setNumeroMuestra(analisis.numero_muestra ?? '')
      setNumeroPaciente(analisis.numero_paciente ?? '')
      setCantidadPicos(toTextValue(analisis.cantidad_picos))
      setConcTotal(toTextValue(analisis.concentracion_total))
      setObservaciones(analisis.observaciones_generales ?? '')
      setRawResult(storedRawResult)
      setProcessorResult(storedProcessorResult)
      setProcessorMeta(readProcessorMeta(storedRawResult))
      setBackendStatus(current => resolveRuntimeBackendStatus(current, storedRawResult))
      setSeparatorRatios(storedSeparatorRatios)
      setSelectedSeparatorIndex(storedSelectedSeparator)
      setReferenceCalibration(storedReferenceCalibration)
      setReferenceCalibrationPattern(storedReferenceCalibration?.pattern ?? DEFAULT_CALIBRATION_PATTERN)
      setReferenceTargets(storedReferenceCalibration ? formatReferenceTargets(storedReferenceCalibration.targets) : createEmptyReferenceTargets())
      setVals({
        albumina: { pct: toTextValue(analisis.albumina_porcentaje), conc: toTextValue(analisis.albumina_concentracion) },
        alfa_1: { pct: toTextValue(analisis.alfa_1_porcentaje), conc: toTextValue(analisis.alfa_1_concentracion) },
        alfa_2: { pct: toTextValue(analisis.alfa_2_porcentaje), conc: toTextValue(analisis.alfa_2_concentracion) },
        beta_1: { pct: toTextValue(analisis.beta_1_porcentaje), conc: toTextValue(analisis.beta_1_concentracion) },
        beta_2: { pct: toTextValue(analisis.beta_2_porcentaje), conc: toTextValue(analisis.beta_2_concentracion) },
        gamma: { pct: toTextValue(analisis.gamma_porcentaje), conc: toTextValue(analisis.gamma_concentracion) },
      })

      const incomingImages = normalizeIncomingImages(location.state?.images as IncomingImageState[] | undefined)
      let imageSeeds = incomingImages

      if (imageSeeds.length === 0) {
        const { data: analisisImagenes, error: imagenesError } = await supabase
          .from('analisis_imagenes')
          .select('tipo,url,nombre_archivo')
          .eq('analisis_id', analisisId)
          .returns<AnalisisImagenRow[]>()
        if (imagenesError) { setError(imagenesError.message); setLoadingExisting(false); return }

        imageSeeds = await Promise.all((analisisImagenes ?? []).map(async image => {
          const processingPreview = await createSignedAnalisisImageUrl(image.url)
          return {
            preview: processingPreview,
            processingPreview,
            tipo: image.tipo ?? 'otro',
            nombre: image.nombre_archivo ?? 'Archivo sin nombre',
            storagePath: image.url,
          }
        }))
      }

      const resolvedImages = await Promise.all(imageSeeds.map(async image => {
        const crop = findCropForImage(image, storedInputImages)
        return {
          ...image,
          draftCrop: crop,
          preview: await createCroppedAnalisisImagePreview(image.processingPreview, crop),
        }
      }))

      setImages(resolvedImages)
      setLoadingExisting(false)
    }
    hydrate()
  }, [analisisId, location.state?.images])

  async function handleProcess() {
    if (!analisisId) { setError('Primero debe existir un analisis persistido para procesar.'); return }
    const sourceImage = images.find(image => image.tipo === 'densitograma') ?? images[0]
    if (!sourceImage?.processingPreview) { setError('No hay una imagen disponible para procesar.'); return }

    setProcessing(true)
    setError('')
    setSuccess('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const storedImages = readStoredInputImages(rawResult)
      const crop = findCropForImage(sourceImage, storedImages)
      const safeTotalConcentration = parseTotalConcentration(concTotal)
      const shouldTryBackend = ANALYSIS_API_ENABLED && processorMode === 'auto'

      let result: LocalProcessorResult
      let algorithmVersion = 'local-prototype-v1.2'
      let processorSource: ProcessorSource = 'frontend_local_fallback'
      let backendFallbackDetail = ''
      let calibrationProfile = ''
      let calibrationVersion = ''

      if (shouldTryBackend) {
        try {
          const backendResult = await processElectrophoresisWithBackend({
            imageUrl: sourceImage.processingPreview,
            fileName: sourceImage.nombre,
            crop,
            totalConcentration: safeTotalConcentration,
          })
          result = backendResult
          algorithmVersion = backendResult.algorithm_version ?? 'fastapi-opencv-v2.2'
          calibrationProfile = backendResult.calibration_profile ?? ''
          calibrationVersion = backendResult.calibration_version ?? ''
          processorSource = 'backend_fastapi'
          setBackendStatus('available')
        } catch (backendError) {
          result = await processElectrophoresisImage({
            imageUrl: sourceImage.processingPreview,
            crop,
            totalConcentration: safeTotalConcentration,
          })
          backendFallbackDetail = backendError instanceof Error ? backendError.message : 'Backend no disponible.'
          setBackendStatus('unavailable')
        }
      } else {
        result = await processElectrophoresisImage({
          imageUrl: sourceImage.processingPreview,
          crop,
          totalConcentration: safeTotalConcentration,
        })
        backendFallbackDetail = processorMode === 'local'
          ? 'Se uso el procesador local por seleccion manual.'
          : ANALYSIS_API_ENABLED
            ? 'Se omitio el backend porque no estuvo disponible en esta sesion. Rehabilitalo cuando el servicio este levantado.'
            : 'El backend esta deshabilitado por configuracion. Define VITE_ANALYSIS_API_URL para habilitarlo.'
      }

      const initialSeparatorRatios = buildDefaultSeparatorRatios(result)
      const nextSelectedSeparatorIndex = 1
      const nextReview = buildManualReviewData(result, initialSeparatorRatios, safeTotalConcentration)
      const computedVals = buildValsFromProcessorResult(result, safeTotalConcentration)

      const nextCantidadPicos = result.detected_peaks.toString()
      const nextRawResult = mergeRawResultWithManualReview({
        ...(rawResult ?? {}),
        processor_status: 'processed',
        last_step: processorSource === 'backend_fastapi' ? 'analysis_processed_backend' : 'analysis_processed_local',
        algorithm_version: algorithmVersion,
        processor_source: processorSource,
        processor_mode: processorMode,
        local_processor: result,
        processor_warning: result.warning,
        backend_status: processorSource === 'backend_fastapi' ? 'available' : ANALYSIS_API_ENABLED ? 'unavailable' : 'disabled',
        calibration_profile: calibrationProfile || null,
        calibration_version: calibrationVersion || null,
        backend_fallback_detail: backendFallbackDetail || null,
        processed_at: new Date().toISOString(),
        processed_by: user?.id ?? null,
      }, nextReview, nextSelectedSeparatorIndex, null)
      const nextProcessorMeta: ProcessorMeta = {
        source: processorSource,
        algorithmVersion,
        calibrationProfile,
        calibrationVersion,
        backendFallbackDetail,
      }

      setCantidadPicos(nextCantidadPicos)
      setVals(computedVals)
      setRawResult(nextRawResult)
      setProcessorResult(result)
      setProcessorMeta(nextProcessorMeta)
      setSeparatorRatios(initialSeparatorRatios)
      setSelectedSeparatorIndex(nextSelectedSeparatorIndex)
      setManualReview(nextReview)
      setReferenceCalibration(null)

      const { error: updateError } = await supabase
        .from('analisis_electroforesis')
        .update(buildAnalysisPayload(user?.id ?? null, nextRawResult, computedVals, nextCantidadPicos))
        .eq('id', analisisId)
      if (updateError) throw new Error(updateError.message)

      if (processorSource === 'backend_fastapi') {
        setSuccess(result.warning ? `Procesamiento backend completado. ${result.warning}` : 'Procesamiento backend completado.')
      } else {
        const fallbackMessage = backendFallbackDetail ? ` ${backendFallbackDetail}` : ''
        const warningMessage = result.warning ? ` ${result.warning}` : ''
        setSuccess(`Se uso el procesador local.${fallbackMessage}${warningMessage}`.trim())
      }
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'No se pudo completar el procesamiento.')
    } finally {
      setProcessing(false)
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!pacienteId) { setError('No se encontro el ID del paciente.'); return }
    setSaving(true)
    setError('')

    const { data: { user } } = await supabase.auth.getUser()
    const nextRawResult = mergeRawResultWithManualReview(
      rawResult,
      manualReview,
      selectedSeparatorIndex,
      referenceCalibration,
      processorResult,
      processorMeta,
    )
    const payload = buildAnalysisPayload(user?.id ?? null, nextRawResult)
    const query = analisisId ? supabase.from('analisis_electroforesis').update(payload).eq('id', analisisId) : supabase.from('analisis_electroforesis').insert(payload)
    const { error: saveError } = await query

    if (saveError) { setError(saveError.message); setSaving(false); return }
    setRawResult(nextRawResult)
    setSaving(false)
    setSuccess(analisisId ? 'Analisis guardado correctamente.' : 'Analisis registrado correctamente.')
    setTimeout(() => navigate('/home'), 1500)
  }

  return (
    <>
      <style>{PRINT_STYLES}</style>
      <div className="analysis-screen flex min-h-screen" style={{ background: 'linear-gradient(135deg, #EEF1F3, #E5EAED)' }}>
      <Sidebar active="Ingresa Paciente" onSelect={() => {}} />
      <div className="flex flex-col flex-1 min-w-0">
        <TopBar name="Usuario" role="Cargo" />
        <main className="flex-1 p-8">
          <div className="flex items-center gap-2 mb-6">
            <FlaskConical size={22} style={{ color: '#5C894A' }} />
            <h1 className="text-2xl font-semibold" style={{ color: '#5C894A' }}>Nuevo Analisis</h1>
          </div>

          {error && <div className="flex items-center gap-2 mb-4 px-4 py-3 rounded-lg text-sm" style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#c0392b' }}><AlertCircle size={15} /> {error}</div>}
          {success && <div className="flex items-center gap-2 mb-4 px-4 py-3 rounded-lg text-sm" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#15803d' }}><CheckCircle size={15} /> {success}</div>}

          <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-5">
              <div className="flex flex-col gap-5">
                <Card title="Densitograma">
 
                  {processorResult && manualReview && (
                    <ProfileChart
                      result={processorResult}
                      meta={processorMeta}
                      review={manualReview}
                      selectedSeparatorIndex={selectedSeparatorIndex}
                      onSelectSeparator={setSelectedSeparatorIndex}
                      onAdjustSeparator={handleAdjustSeparator}
                      onResetSeparators={handleResetSeparators}
                    />
                  )}
                  <p className="text-xs mt-3" style={{ color: '#94BB66' }}>
                    Analisis vinculado a la muestra. La revision del densitograma recalcula la tabla en tiempo real y se guarda con el estudio.
                  </p>
                </Card>

                <Card title="Observaciones">
                  <textarea rows={6} value={observaciones} onChange={event => setObservaciones(event.target.value)} placeholder="Describir observaciones del analisis..." className={inputClass} style={inputStyle} onFocus={focusGreen} onBlur={blurGray} />
                </Card>
              </div>

              <div className="flex flex-col gap-5">


                <Card title="Datos de la tira">
                  <div className="grid grid-cols-[140px_minmax(0,1fr)] gap-x-3 gap-y-2.5 items-center">
                    <div className="col-span-2 w-full rounded-xl flex flex-col items-center justify-center gap-1.5 px-2.5 py-2.5" style={{ minHeight: 132, background: '#F4F5F7', border: '1.5px dashed #DFE0E5' }}>
                      {loadingExisting ? <p className="text-sm" style={{ color: '#54585E' }}>Cargando estudio...</p> : images.length > 0 ? (
                        <div className="flex gap-2 flex-wrap justify-center">
                          {images.map((image, index) => image.preview ? (
                            <img key={`${image.nombre}-${index}`} src={image.preview} alt={image.nombre} className="h-20 rounded-md object-contain" style={{ border: '1px solid #DFE0E5' }} />
                          ) : (
                            <div key={`${image.nombre}-${index}`} className="flex flex-col items-center justify-center gap-1 w-20 h-20 rounded-md" style={{ background: '#ECECEC' }}>
                              <ImageIcon size={12} style={{ color: '#94BB66' }} />
                              <span className="text-[10px] truncate w-16 text-center" style={{ color: '#54585E' }}>{image.nombre}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <>
                          <ImageIcon size={32} style={{ color: '#DFE0E5' }} />
                          <p className="text-sm" style={{ color: '#DFE0E5' }}>Visualizacion del densitograma</p>
                        </>
                      )}
                    </div>

                    <label className="text-xs font-semibold" style={{ color: '#54585E' }}>Nro. Placa</label>
                    <input value={numeroPlaca} onChange={event => setNumeroPlaca(event.target.value)} placeholder="Nro. Placa" className={compactInputClass} style={inputStyle} onFocus={focusGreen} onBlur={blurGray} />

                    <label className="text-xs font-semibold" style={{ color: '#54585E' }}>Nro. Muestra</label>
                    <input value={numeroMuestra} onChange={event => setNumeroMuestra(event.target.value)} placeholder="Nro. Muestra" className={compactInputClass} style={inputStyle} onFocus={focusGreen} onBlur={blurGray} />

                    <label className="text-xs font-semibold" style={{ color: '#54585E' }}>Nro. Paciente</label>
                    <input value={numeroPaciente} onChange={event => setNumeroPaciente(event.target.value)} placeholder="Nro. Paciente" className={compactInputClass} style={inputStyle} onFocus={focusGreen} onBlur={blurGray} />

                    <label className="text-xs font-semibold" style={{ color: '#54585E' }}>Cantidad de picos</label>
                    <input type="number" value={cantidadPicos} onChange={event => setCantidadPicos(event.target.value)} placeholder="Cantidad de picos" className={compactInputClass} style={inputStyle} onFocus={focusGreen} onBlur={blurGray} />

                    <label className="text-xs font-semibold" style={{ color: '#54585E' }}>Conc. total (g/dL)</label>
                    <input type="number" step="0.01" value={concTotal} onChange={event => setConcTotal(event.target.value)} placeholder="Concentracion total (g/dL)" className={compactInputClass} style={inputStyle} onFocus={focusGreen} onBlur={blurGray} />

                    <div />
                    <p className="text-xs hidden" style={{ color: '#54585E' }}>
                      Este valor habilita el calculo de `g/dL` para cada fraccion. Si queda vacio, el estudio se procesa solo en porcentaje.
                    </p>
                  </div>
                </Card>

                

                <Card title="Fracciones proteicas">
                  <table className="w-full text-xs">
                    <thead>
                      <tr style={{ borderBottom: '1px solid #DFE0E5' }}>
                        <th className="text-left pb-2 pr-2" style={{ color: '#5C894A' }}>Fraccion</th>
                        <th className="text-center pb-2 px-1" style={{ color: '#54585E' }}>%</th>
                        <th className="text-center pb-2 px-1" style={{ color: '#54585E' }}>Ref. %</th>
                        <th className="text-center pb-2 px-1" style={{ color: '#54585E' }}>Conc.</th>
                        <th className="text-center pb-2 px-1" style={{ color: '#54585E' }}>Ref. Conc. (g/dL)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fracciones.map(fraccion => (
                        <tr key={fraccion.key} style={{ borderBottom: '1px solid #f0f0f0' }}>
                          <td className="py-1.5 pr-2 font-medium" style={{ color: '#54585E' }}>{fraccion.label}</td>
                          <td className="py-1.5 px-1"><input type="number" step="0.01" value={vals[fraccion.key].pct} onChange={event => handleFraccion(fraccion.key, event.target.value)} className="w-full rounded-md px-2 py-1 text-xs outline-none transition" style={inputStyle} onFocus={focusGreen} onBlur={blurGray} /></td>
                          <td className="py-1.5 px-1 text-center font-medium" style={{ color: '#6B7178' }}>{FRACTION_REFERENCES[fraccion.key].percent}</td>
                          <td className="py-1.5 px-1"><input type="number" step="0.01" value={vals[fraccion.key].conc} readOnly className="w-full rounded-md px-2 py-1 text-xs outline-none transition" style={{ ...inputStyle, background: '#F4F5F7' }} /></td>
                          <td className="py-1.5 px-1 text-center font-medium" style={{ color: '#6B7178' }}>{FRACTION_REFERENCES[fraccion.key].concentration}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {[
                      ['A/G Ratio', derivedAnalysisValues.agRatio, 'Albumina / globulinas'],
                      ['Globulinas', derivedAnalysisValues.globulinsPct, derivedAnalysisValues.globulinsConc],
                      ['Alfa total', derivedAnalysisValues.alphaPct, derivedAnalysisValues.alphaConc],
                      ['Beta total', derivedAnalysisValues.betaPct, derivedAnalysisValues.betaConc],
                    ].map(([label, value, detail]) => (
                      <div key={label} className="rounded-xl px-3 py-2.5" style={{ background: '#F4F5F7', border: '1px solid #DFE0E5' }}>
                        <p className="text-[11px] font-semibold" style={{ color: '#5C894A' }}>{label}</p>
                        <p className="text-base font-semibold mt-1" style={{ color: '#54585E' }}>{formatDisplayValue(value)}</p>
                        <p className="text-[10px] mt-1" style={{ color: '#6B7178' }}>{formatDisplayValue(detail)}</p>
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 text-[11px]" style={{ color: '#6B7178' }}>
                    Rangos de referencia iniciales para adultos. Ajustar segun el metodo y validacion clinica del laboratorio.
                  </p>
                </Card>

                {processorResult && (
                  <Card title="Calibracion con PDF">
                    <div className="flex flex-col gap-3">
                      <p className="text-xs" style={{ color: '#54585E' }}>
                        Ingresá los porcentajes validados del informe externo. El sistema mueve los separadores para aproximar las areas de la curva a esos valores sin modificar el perfil original.
                      </p>
                      <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-x-3 gap-y-2 items-center">
                        <label className="text-xs font-semibold" style={{ color: '#54585E' }}>Patron</label>
                        <select
                          value={referenceCalibrationPattern}
                          onChange={event => handleReferenceCalibrationPattern(event.target.value)}
                          className={compactInputClass}
                          style={inputStyle}
                          onFocus={focusGreen}
                          onBlur={blurGray}
                        >
                          {CALIBRATION_PATTERN_OPTIONS.map(option => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                      </div>
                      <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-x-3 gap-y-2 items-center">
                        {fracciones.map(fraccion => (
                          <div key={`reference-target-${fraccion.key}`} className="contents">
                            <label className="text-xs font-semibold" style={{ color: '#54585E' }}>{fraccion.label}</label>
                            <input
                              type="number"
                              step="0.01"
                              value={referenceTargets[fraccion.key]}
                              onChange={event => handleReferenceTarget(fraccion.key, event.target.value)}
                              placeholder="% PDF"
                              className={compactInputClass}
                              style={inputStyle}
                              onFocus={focusGreen}
                              onBlur={blurGray}
                            />
                          </div>
                        ))}
                      </div>
                      <div
                        className="rounded-xl px-3 py-2 text-[11px]"
                        style={referenceTargetSummary.complete && !referenceTargetSummary.withinTolerance
                          ? { background: '#FEF2F2', border: '1px solid #FECACA', color: '#C0392B' }
                          : { background: '#F4F5F7', border: '1px solid #DFE0E5', color: '#54585E' }}
                      >
                        Suma PDF: {referenceTargetSummary.complete ? `${referenceTargetSummary.total.toFixed(2)}%` : 'Completar 6 fracciones'}.
                        {' '}Tolerancia aceptada: {100 - REFERENCE_TARGET_SUM_TOLERANCE}% - {100 + REFERENCE_TARGET_SUM_TOLERANCE}%.
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={handleApplyReferenceCalibration}
                          disabled={!referenceTargetSummary.withinTolerance}
                          className="rounded-lg px-3 py-2 text-xs font-semibold transition disabled:opacity-60 disabled:cursor-not-allowed"
                          style={{ background: '#4A9151', color: '#F1FAEF', border: '1px solid #4A9151' }}
                        >
                          Ajustar con PDF
                        </button>
                        <button
                          type="button"
                          onClick={handleUseCurrentFractionsAsReference}
                          className="rounded-lg px-3 py-2 text-xs font-medium transition"
                          style={{ background: '#FFFFFF', color: '#54585E', border: '1px solid #DFE0E5' }}
                        >
                          Usar tabla actual
                        </button>
                      </div>
                      <p className="text-[11px]" style={{ color: '#6B7178' }}>
                        Esto activa `Revision manual`. Si el ajuste mejora, guardá el analisis y usá los rangos resultantes como insumo para calibración global.
                      </p>
                      {referenceCalibration && (
                        <div className="rounded-xl px-3 py-2 text-[11px]" style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', color: '#15803D' }}>
                          Calibracion PDF activa. Al guardar se persistiran objetivos, rangos aplicados, picos, minimos, crop y version del motor en `resultado_crudo`.
                        </div>
                      )}
                    </div>
                  </Card>
                )}

                <Card title="Motor de procesamiento">
                  <div className="flex flex-col gap-3">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setProcessorMode('auto')}
                        disabled={!ANALYSIS_API_ENABLED}
                        className="flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition"
                        style={processorMode === 'auto'
                          ? { background: '#4A9151', color: '#F1FAEF', border: '1px solid #4A9151' }
                          : { background: ANALYSIS_API_ENABLED ? '#FFFFFF' : '#F4F5F7', color: ANALYSIS_API_ENABLED ? '#54585E' : '#A0A4AA', border: '1px solid #DFE0E5' }}
                      >
                        Automatico
                      </button>
                      <button
                        type="button"
                        onClick={() => setProcessorMode('local')}
                        className="flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition"
                        style={processorMode === 'local'
                          ? { background: '#4A9151', color: '#F1FAEF', border: '1px solid #4A9151' }
                          : { background: '#FFFFFF', color: '#54585E', border: '1px solid #DFE0E5' }}
                      >
                        Solo local
                      </button>
                    </div>
                    <div className="rounded-xl px-3 py-3 text-xs" style={{ background: '#FFFFFF', border: '1px solid #DFE0E5' }}>
                      <div className="flex items-center justify-between gap-3">
                        <span style={{ color: '#54585E' }}>Estado backend</span>
                        <span className="rounded-full px-2 py-1 font-semibold" style={backendStatus === 'available'
                          ? { background: '#F0FDF4', color: '#15803D' }
                          : backendStatus === 'unavailable'
                            ? { background: '#FEF2F2', color: '#C0392B' }
                            : { background: '#F4F5F7', color: '#54585E' }}>
                          {backendStatusLabel(backendStatus)}
                        </span>
                      </div>
                      <p className="mt-2" style={{ color: '#54585E' }}>
                        Endpoint configurado: {ANALYSIS_API_ENABLED ? ANALYSIS_API_URL : 'No configurado'}
                      </p>
                      <p className="mt-2" style={{ color: '#54585E' }}>
                        Ultimo procesamiento: {processorSourceLabel(processorMeta.source)}{processorMeta.algorithmVersion ? ` (${processorMeta.algorithmVersion})` : ''}
                      </p>
                      {processorMeta.backendFallbackDetail && (
                        <p className="mt-2" style={{ color: '#C0392B' }}>
                          Detalle: {processorMeta.backendFallbackDetail}
                        </p>
                      )}
                    </div>
                    {backendStatus === 'unavailable' && processorMode === 'auto' && (
                      <button
                        type="button"
                        onClick={() => setBackendStatus('unknown')}
                        className="w-full rounded-lg px-3 py-2 text-xs font-medium transition"
                        style={{ background: '#FBFBFC', color: '#54585E', border: '1px solid #DFE0E5' }}
                      >
                        Marcar backend como sin verificar
                      </button>
                    )}
                    <p className="text-xs" style={{ color: '#54585E' }}>
                      {ANALYSIS_API_ENABLED
                        ? '`Automatico` intenta FastAPI en cada procesamiento. Si falla, usa respaldo local y muestra el detalle del error. `Solo local` evita el intento al backend.'
                        : 'El backend solo se habilita si definis `VITE_ANALYSIS_API_URL` en el frontend. Mientras no exista esa variable, el procesamiento queda en modo local.'}
                    </p>
                  </div>
                </Card>

                {processorResult && (
                  <Card title="Diagnostico tecnico">
                    <div className="flex flex-col gap-3 text-xs" style={{ color: '#54585E' }}>
                      <div className="rounded-xl p-3" style={{ background: '#FFFFFF', border: '1px solid #DFE0E5' }}>
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-semibold" style={{ color: '#5C894A' }}>Fuente de valores</span>
                          <span className="rounded-full px-2 py-1 font-semibold" style={usingProcessorFractions
                            ? { background: '#F0FDF4', color: '#15803D' }
                            : { background: '#FFF7ED', color: '#C76A16' }}>
                            {usingProcessorFractions ? 'Procesador' : 'Revision manual'}
                          </span>
                        </div>
                        <p className="mt-2" style={{ color: '#6B7178' }}>
                          Si esta en `Procesador`, la tabla usa las fracciones calculadas por el motor. Si esta en `Revision manual`, la tabla usa las areas delimitadas por los separadores movidos.
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div className="rounded-xl p-2.5" style={{ background: '#F4F5F7', border: '1px solid #DFE0E5' }}>
                          <p className="text-[10px] font-semibold" style={{ color: '#6B7178' }}>Motor</p>
                          <p className="mt-1 font-semibold">{processorSourceLabel(processorMeta.source)}</p>
                        </div>
                        <div className="rounded-xl p-2.5" style={{ background: '#F4F5F7', border: '1px solid #DFE0E5' }}>
                          <p className="text-[10px] font-semibold" style={{ color: '#6B7178' }}>Eje</p>
                          <p className="mt-1 font-semibold">{processorResult.axis.toUpperCase()}</p>
                        </div>
                        <div className="rounded-xl p-2.5" style={{ background: '#F4F5F7', border: '1px solid #DFE0E5' }}>
                          <p className="text-[10px] font-semibold" style={{ color: '#6B7178' }}>Perfil</p>
                          <p className="mt-1 font-semibold">{processorResult.profile_length} puntos</p>
                        </div>
                        <div className="rounded-xl p-2.5" style={{ background: '#F4F5F7', border: '1px solid #DFE0E5' }}>
                          <p className="text-[10px] font-semibold" style={{ color: '#6B7178' }}>Area total</p>
                          <p className="mt-1 font-semibold">{formatDiagnosticNumber(processorResult.total_area, 4)}</p>
                        </div>
                      </div>

                      <div className="rounded-xl p-3" style={{ background: '#FFFFFF', border: '1px solid #DFE0E5' }}>
                        <p className="font-semibold" style={{ color: '#5C894A' }}>Crop usado</p>
                        <p className="mt-1" style={{ color: '#6B7178' }}>
                          x {processorResult.crop_used.left}, y {processorResult.crop_used.top}, ancho {processorResult.crop_used.width}, alto {processorResult.crop_used.height}
                        </p>
                      </div>

                      <div className="rounded-xl p-3" style={{ background: '#FFFFFF', border: '1px solid #DFE0E5' }}>
                        <p className="font-semibold" style={{ color: '#5C894A' }}>Picos y minimos detectados</p>
                        <p className="mt-1" style={{ color: '#6B7178' }}>Picos: {formatIndexList(processorResult.peaks, processorResult.profile_length)}</p>
                        <p className="mt-1" style={{ color: '#6B7178' }}>Minimos: {formatIndexList(processorResult.valleys, processorResult.profile_length)}</p>
                      </div>

                      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #DFE0E5' }}>
                        <table className="w-full text-[11px]">
                          <thead style={{ background: '#F4F5F7' }}>
                            <tr>
                              <th className="text-left px-2 py-2" style={{ color: '#5C894A' }}>Fraccion</th>
                              <th className="text-right px-2 py-2" style={{ color: '#54585E' }}>Motor %</th>
                              <th className="text-right px-2 py-2" style={{ color: '#54585E' }}>Tabla %</th>
                              <th className="text-right px-2 py-2" style={{ color: '#54585E' }}>Rango motor</th>
                              <th className="text-right px-2 py-2" style={{ color: '#54585E' }}>Rango tabla</th>
                            </tr>
                          </thead>
                          <tbody>
                            {fracciones.map(fraccion => {
                              const processorFraction = processorResult.fractions[fraccion.key]
                              const reviewFraction = manualReview?.fractions[fraccion.key]
                              return (
                                <tr key={`diagnostic-${fraccion.key}`} style={{ borderTop: '1px solid #EDF0F2' }}>
                                  <td className="px-2 py-1.5 font-semibold" style={{ color: '#54585E' }}>{fraccion.label}</td>
                                  <td className="px-2 py-1.5 text-right">{formatDiagnosticNumber(processorFraction.percentage)}</td>
                                  <td className="px-2 py-1.5 text-right">{formatDisplayValue(vals[fraccion.key].pct)}</td>
                                  <td className="px-2 py-1.5 text-right" style={{ color: '#6B7178' }}>
                                    {formatProfilePosition(processorFraction.start, processorResult.profile_length)} - {formatProfilePosition(processorFraction.end, processorResult.profile_length)}
                                  </td>
                                  <td className="px-2 py-1.5 text-right" style={{ color: '#6B7178' }}>
                                    {reviewFraction
                                      ? `${formatProfilePosition(reviewFraction.start, processorResult.profile.length)} - ${formatProfilePosition(reviewFraction.end, processorResult.profile.length)}`
                                      : '---'}
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </Card>
                )}

                <div className="flex flex-col gap-2">
                  <button type="button" onClick={handleProcess} disabled={processing || loadingExisting || images.length === 0} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all cursor-pointer disabled:opacity-60" style={{ background: 'linear-gradient(180deg, #94BB66, #4A9151)', border: '1px solid #56874A', color: '#F1FAEF', boxShadow: '0 1px 3px rgba(0,0,0,0.25)' }}>
                    <Play size={15} /> {processing ? 'Procesando...' : processorResult ? 'Reprocesar borrador' : 'Iniciar procesamiento'}
                  </button>
                  <button type="submit" disabled={saving || loadingExisting || processing} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium cursor-pointer transition disabled:opacity-60" style={{ color: '#54585E', border: '1px solid #DFE0E5', background: '#FBFBFC' }}>
                    {saving ? 'Guardando...' : 'Guardar analisis'}
                  </button>
                  <button type="button" onClick={handlePrint} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium cursor-pointer transition" style={{ color: '#54585E', border: '1px solid #DFE0E5', background: '#FBFBFC' }}>
                    <Printer size={15} /> Imprimir
                  </button>
                  <button type="button" onClick={() => navigate(-1)} className="w-full py-2 rounded-lg text-xs cursor-pointer transition" style={{ color: '#94BB66', background: 'transparent' }}>← Volver</button>
                </div>
              </div>
            </div>
          </form>
        </main>
      </div>
      </div>

      <div className="analysis-print" style={{ padding: '0', color: '#54585E' }}>
        <div className="rounded-[28px] p-6" style={{ background: 'linear-gradient(135deg, #EEF1F3, #E5EAED)' }}>
          <div className="rounded-[24px] p-6" style={{ background: 'linear-gradient(160deg, #FBFBFC, #FAF9FB)', border: '1px solid #DFE0E5' }}>
            <div className="flex items-start justify-between gap-6 pb-5" style={{ borderBottom: '1px solid #DFE0E5' }}>
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.24em]" style={{ color: '#94BB66' }}>ProSoft V2</p>
                <h1 className="text-sm font-semibold mt-2" style={{ color: '#5C894A' }}>Informe de analisis electroforetico</h1>
                <p className="text-sm mt-2" style={{ color: '#54585E' }}>
                  Resumen de densitograma, datos de la tira y fracciones proteicas.
                </p>
              </div>
              <div className="text-right text-xs" style={{ color: '#54585E' }}>
                <p><strong>Fecha de impresion:</strong> {printTimestamp}</p>
                <p className="mt-1 hidden"><strong>Analisis:</strong> {formatDisplayValue(analisisId)}</p>
                <p className="mt-1 hidden"><strong>Motor:</strong> {processorSourceLabel(processorMeta.source)}</p>
              </div>
            </div>

            <div className="mt-5">
              {processorResult && manualReview ? (
                <PrintableProfileChart result={processorResult} review={manualReview} meta={processorMeta} />
              ) : (
                <div className="rounded-2xl p-5" style={{ background: 'linear-gradient(160deg, #FBFBFC, #FAF9FB)', border: '1px solid #DFE0E5' }}>
                  <p className="text-sm font-semibold" style={{ color: '#5C894A' }}>Densitograma</p>
                  <p className="text-sm mt-2" style={{ color: '#54585E' }}>Todavia no hay un procesamiento disponible para imprimir.</p>
                </div>
              )}
            </div>

            <div className="grid grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)] gap-3 mt-3 items-start">
              <div className="rounded-2xl p-3" style={{ background: 'linear-gradient(160deg, #FBFBFC, #FAF9FB)', border: '1px solid #DFE0E5' }}>
                <p className="text-[13px] font-semibold mb-2" style={{ color: '#5C894A' }}>Datos de la tira</p>
                <div className="grid grid-cols-[88px_minmax(0,1fr)_88px_minmax(0,1fr)] gap-x-2 gap-y-1 items-center text-[11px] leading-tight">
                  <span className="font-semibold" style={{ color: '#54585E' }}>Nro. Placa</span>
                  <span>{formatDisplayValue(numeroPlaca)}</span>
                  <span className="font-semibold" style={{ color: '#54585E' }}>Nro. Muestra</span>
                  <span>{formatDisplayValue(numeroMuestra)}</span>
                  <span className="font-semibold" style={{ color: '#54585E' }}>Nro. Paciente</span>
                  <span>{formatDisplayValue(numeroPaciente)}</span>
                  <span className="font-semibold" style={{ color: '#54585E' }}>Cantidad de picos</span>
                  <span>{formatDisplayValue(cantidadPicos)}</span>
                  <span className="font-semibold" style={{ color: '#54585E' }}>Conc. total</span>
                  <span>{formatDisplayValue(concTotal ? `${concTotal} g/dL` : '')}</span>
                </div>
                {observaciones.trim() && (
                  <div className="mt-2 rounded-lg p-2" style={{ background: '#FFFFFF', border: '1px solid #DFE0E5' }}>
                    <p className="text-xs font-semibold" style={{ color: '#5C894A' }}>Observaciones</p>
                    <p className="text-[11px] mt-1 whitespace-pre-wrap leading-snug" style={{ color: '#54585E' }}>{observaciones}</p>
                  </div>
                )}
              </div>

              <div className="rounded-2xl p-3" style={{ background: 'linear-gradient(160deg, #FBFBFC, #FAF9FB)', border: '1px solid #DFE0E5' }}>
                <p className="text-[13px] font-semibold mb-2" style={{ color: '#5C894A' }}>Vista de la tira</p>
                {printableImages.length > 0 ? (
                  <div className="grid grid-cols-2 gap-1.5">
                    {printableImages.map((image, index) => (
                      <div key={`${image.nombre}-${index}`} className="rounded-lg p-1" style={{ background: '#FFFFFF', border: '1px solid #DFE0E5' }}>
                        <img src={image.preview} alt={image.nombre} className="w-full h-10 object-contain rounded-md" />
                        <div className="flex justify-end mt-1 text-[9px] leading-tight" style={{ color: '#54585E' }}>
                          <span className="font-semibold">{image.tipo}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg px-3 py-4 text-xs" style={{ background: '#FFFFFF', border: '1px dashed #DFE0E5', color: '#6B7178' }}>
                    No hay imagenes disponibles para incluir en el informe.
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-2xl p-5 mt-5" style={{ background: 'linear-gradient(160deg, #FBFBFC, #FAF9FB)', border: '1px solid #DFE0E5' }}>
              <p className="text-sm font-semibold mb-4" style={{ color: '#5C894A' }}>Fracciones proteicas</p>
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: '1px solid #DFE0E5' }}>
                    <th className="text-left py-2 pr-3" style={{ color: '#5C894A' }}>Fraccion</th>
                    <th className="text-center py-2 px-2" style={{ color: '#54585E' }}>%</th>
                    <th className="text-center py-2 px-2" style={{ color: '#54585E' }}>Ref. %</th>
                    <th className="text-center py-2 px-2" style={{ color: '#54585E' }}>Conc.</th>
                    <th className="text-center py-2 px-2" style={{ color: '#54585E' }}>Ref. Conc. (g/dL)</th>
                  </tr>
                </thead>
                <tbody>
                  {fracciones.map(fraccion => (
                    <tr key={`print-${fraccion.key}`} style={{ borderBottom: '1px solid #F0F0F0' }}>
                      <td className="py-2 pr-3 font-medium">{fraccion.label}</td>
                      <td className="py-2 px-2 text-center">{formatDisplayValue(vals[fraccion.key].pct)}</td>
                      <td className="py-2 px-2 text-center" style={{ color: '#6B7178' }}>{FRACTION_REFERENCES[fraccion.key].percent}</td>
                      <td className="py-2 px-2 text-center">{formatDisplayValue(vals[fraccion.key].conc)}</td>
                      <td className="py-2 px-2 text-center" style={{ color: '#6B7178' }}>{FRACTION_REFERENCES[fraccion.key].concentration}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-3 grid grid-cols-4 gap-2">
                {[
                  ['A/G Ratio', derivedAnalysisValues.agRatio, 'Albumina / globulinas'],
                  ['Globulinas', derivedAnalysisValues.globulinsPct, derivedAnalysisValues.globulinsConc],
                  ['Alfa total', derivedAnalysisValues.alphaPct, derivedAnalysisValues.alphaConc],
                  ['Beta total', derivedAnalysisValues.betaPct, derivedAnalysisValues.betaConc],
                ].map(([label, value, detail]) => (
                  <div key={`print-derived-${label}`} className="rounded-xl px-3 py-2.5" style={{ background: '#F4F5F7', border: '1px solid #DFE0E5' }}>
                    <p className="text-[11px] font-semibold" style={{ color: '#5C894A' }}>{label}</p>
                    <p className="text-sm font-semibold mt-1" style={{ color: '#54585E' }}>{formatDisplayValue(value)}</p>
                    <p className="text-[10px] mt-1" style={{ color: '#6B7178' }}>{formatDisplayValue(detail)}</p>
                  </div>
                ))}
              </div>
              <p className="text-[11px] mt-3" style={{ color: '#6B7178' }}>
                Rangos de referencia iniciales para adultos. Validar contra el metodo, equipo y poblacion de referencia del laboratorio.
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
