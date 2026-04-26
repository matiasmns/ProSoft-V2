import bundledCalibration from '../../backend/app/default_calibration.json'
import { ANALYSIS_API_ENABLED, ANALYSIS_API_URL } from './backendProcessor'

export type ProcessorFractionKey = 'albumina' | 'alfa_1' | 'alfa_2' | 'beta_1' | 'beta_2' | 'gamma'

export type ProcessorFractionWindow = {
  key: ProcessorFractionKey
  start: number
  end: number
}

export type ProcessorCalibrationProfile = {
  profile_name: string
  profile_version: string
  description: string | null
  gaussian_blur_kernel_size: number
  projection_top_fraction: number
  smoothing_sigma_divisor: number
  smoothing_sigma_min: number
  signal_floor: number
  min_signal_dynamic_range: number
  global_baseline_percentile: number
  residual_baseline_percentile: number
  local_baseline_min_correlation: number
  local_baseline_max_peak_shift_ratio: number
  baseline_window_divisor: number
  baseline_window_min: number
  peak_prominence: number
  peak_distance_divisor: number
  peak_distance_min: number
  expected_peak_warning_threshold: number
  crop_warning_min_width: number
  crop_warning_min_height: number
  profile_downsample_points: number
  high_valley_warning_level: number
  albumin_target_position_in_window: number
  boundary_shift_limit_ratio: number
  gaussian_width_min_ratio: number
  gaussian_width_scales: number[]
  gaussian_fit_iterations: number
  gaussian_fit_epsilon: number
  reference_valley_snap_window_ratio: number
  reference_max_fraction_error_after_snap: number
  reference_max_total_error_increase_after_snap: number
  fraction_windows: ProcessorFractionWindow[]
}

export type ProcessorCalibrationResponse = ProcessorCalibrationProfile & {
  algorithm_version: string
}

export const PROCESSOR_FRACTION_KEYS: ProcessorFractionKey[] = ['albumina', 'alfa_1', 'alfa_2', 'beta_1', 'beta_2', 'gamma']
export const LOCAL_FALLBACK_ALGORITHM_VERSION = 'local-calibrated-v3.6'

let calibrationRequest: Promise<ProcessorCalibrationResponse> | null = null

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readString(source: Record<string, unknown>, key: string) {
  const value = source[key]
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`La calibracion no define un texto valido para ${key}.`)
  }
  return value
}

function readOptionalString(source: Record<string, unknown>, key: string) {
  const value = source[key]
  if (value == null) return null
  if (typeof value !== 'string') {
    throw new Error(`La calibracion tiene un valor invalido para ${key}.`)
  }
  return value
}

function readNumber(source: Record<string, unknown>, key: string) {
  const value = source[key]
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`La calibracion no define un numero valido para ${key}.`)
  }
  return value
}

function normalizeFractionWindows(value: unknown): ProcessorFractionWindow[] {
  if (!Array.isArray(value) || value.length !== PROCESSOR_FRACTION_KEYS.length) {
    throw new Error('La calibracion debe definir fraction_windows completas.')
  }

  return value.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new Error('fraction_windows contiene una entrada invalida.')
    }

    const key = readString(entry, 'key') as ProcessorFractionKey
    const start = readNumber(entry, 'start')
    const end = readNumber(entry, 'end')

    if (key !== PROCESSOR_FRACTION_KEYS[index]) {
      throw new Error('fraction_windows no respeta el orden esperado.')
    }

    return { key, start, end }
  })
}

function normalizeCalibration(value: unknown): ProcessorCalibrationProfile {
  if (!isRecord(value)) {
    throw new Error('La calibracion recibida no es un objeto valido.')
  }

  return {
    profile_name: readString(value, 'profile_name'),
    profile_version: readString(value, 'profile_version'),
    description: readOptionalString(value, 'description'),
    gaussian_blur_kernel_size: readNumber(value, 'gaussian_blur_kernel_size'),
    projection_top_fraction: readNumber(value, 'projection_top_fraction'),
    smoothing_sigma_divisor: readNumber(value, 'smoothing_sigma_divisor'),
    smoothing_sigma_min: readNumber(value, 'smoothing_sigma_min'),
    signal_floor: readNumber(value, 'signal_floor'),
    min_signal_dynamic_range: readNumber(value, 'min_signal_dynamic_range'),
    global_baseline_percentile: readNumber(value, 'global_baseline_percentile'),
    residual_baseline_percentile: readNumber(value, 'residual_baseline_percentile'),
    local_baseline_min_correlation: readNumber(value, 'local_baseline_min_correlation'),
    local_baseline_max_peak_shift_ratio: readNumber(value, 'local_baseline_max_peak_shift_ratio'),
    baseline_window_divisor: readNumber(value, 'baseline_window_divisor'),
    baseline_window_min: readNumber(value, 'baseline_window_min'),
    peak_prominence: readNumber(value, 'peak_prominence'),
    peak_distance_divisor: readNumber(value, 'peak_distance_divisor'),
    peak_distance_min: readNumber(value, 'peak_distance_min'),
    expected_peak_warning_threshold: readNumber(value, 'expected_peak_warning_threshold'),
    crop_warning_min_width: readNumber(value, 'crop_warning_min_width'),
    crop_warning_min_height: readNumber(value, 'crop_warning_min_height'),
    profile_downsample_points: readNumber(value, 'profile_downsample_points'),
    high_valley_warning_level: readNumber(value, 'high_valley_warning_level'),
    albumin_target_position_in_window: readNumber(value, 'albumin_target_position_in_window'),
    boundary_shift_limit_ratio: readNumber(value, 'boundary_shift_limit_ratio'),
    gaussian_width_min_ratio: readNumber(value, 'gaussian_width_min_ratio'),
    gaussian_width_scales: Array.isArray(value.gaussian_width_scales)
      ? value.gaussian_width_scales.map((entry, index) => {
          if (typeof entry !== 'number' || !Number.isFinite(entry)) {
            throw new Error(`gaussian_width_scales[${index}] no es valido.`)
          }
          return entry
        })
      : (() => { throw new Error('La calibracion debe definir gaussian_width_scales.') })(),
    gaussian_fit_iterations: readNumber(value, 'gaussian_fit_iterations'),
    gaussian_fit_epsilon: readNumber(value, 'gaussian_fit_epsilon'),
    reference_valley_snap_window_ratio: readNumber(value, 'reference_valley_snap_window_ratio'),
    reference_max_fraction_error_after_snap: readNumber(value, 'reference_max_fraction_error_after_snap'),
    reference_max_total_error_increase_after_snap: readNumber(value, 'reference_max_total_error_increase_after_snap'),
    fraction_windows: normalizeFractionWindows(value.fraction_windows),
  }
}

const bundledProcessorCalibration = normalizeCalibration(bundledCalibration)

export function getBundledProcessorCalibration() {
  return bundledProcessorCalibration
}

async function fetchProcessorCalibration(): Promise<ProcessorCalibrationResponse> {
  if (!ANALYSIS_API_ENABLED) {
    throw new Error('El backend de analisis no esta habilitado.')
  }

  let response: Response
  try {
    response = await fetch(`${ANALYSIS_API_URL}/api/v1/calibration`)
  } catch {
    throw new Error(`No se pudo leer la calibracion del backend en ${ANALYSIS_API_URL}.`)
  }

  if (!response.ok) {
    throw new Error('El backend no devolvio un perfil de calibracion utilizable.')
  }

  const payload = await response.json() as unknown
  if (!isRecord(payload)) {
    throw new Error('La respuesta de calibracion del backend es invalida.')
  }

  return {
    algorithm_version: readString(payload, 'algorithm_version'),
    ...normalizeCalibration(payload),
  }
}

export async function resolveLocalProcessorCalibration(): Promise<ProcessorCalibrationResponse> {
  if (!ANALYSIS_API_ENABLED) {
    return {
      algorithm_version: LOCAL_FALLBACK_ALGORITHM_VERSION,
      ...bundledProcessorCalibration,
    }
  }

  if (!calibrationRequest) {
    calibrationRequest = fetchProcessorCalibration().catch(error => {
      calibrationRequest = null
      throw error
    })
  }

  try {
    return await calibrationRequest
  } catch {
    return {
      algorithm_version: LOCAL_FALLBACK_ALGORITHM_VERSION,
      ...bundledProcessorCalibration,
    }
  }
}
