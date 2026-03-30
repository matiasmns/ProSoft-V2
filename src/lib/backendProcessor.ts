import type { CropPayload } from './electroforesis'
import type { LocalProcessorResult } from './localProcessor'

export type BackendProcessorResult = LocalProcessorResult & {
  algorithm_version?: string
  calibration_profile?: string
  calibration_version?: string
}

const configuredAnalysisApiUrl = import.meta.env.VITE_ANALYSIS_API_URL?.trim() ?? ''
export const ANALYSIS_API_URL = configuredAnalysisApiUrl
export const ANALYSIS_API_ENABLED = ANALYSIS_API_URL.length > 0

function appendNumber(formData: FormData, field: string, value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return
  formData.append(field, String(Math.round(value)))
}

export async function processElectrophoresisWithBackend(input: {
  imageUrl: string
  fileName: string
  crop?: CropPayload | null
  totalConcentration?: number | null
}) {
  if (!ANALYSIS_API_ENABLED) {
    throw new Error('El backend de analisis no esta habilitado. Define VITE_ANALYSIS_API_URL para usar FastAPI.')
  }

  let imageResponse: Response
  try {
    imageResponse = await fetch(input.imageUrl)
  } catch {
    throw new Error('No se pudo leer la imagen local para enviarla al backend.')
  }

  if (!imageResponse.ok) {
    throw new Error('No se pudo leer la imagen para enviarla al backend.')
  }

  const blob = await imageResponse.blob()
  const formData = new FormData()
  formData.append('file', blob, input.fileName || 'muestra.png')
  appendNumber(formData, 'crop_left', input.crop?.izquierda)
  appendNumber(formData, 'crop_top', input.crop?.arriba)
  appendNumber(formData, 'crop_width', input.crop?.ancho)
  appendNumber(formData, 'crop_height', input.crop?.alto)
  appendNumber(formData, 'crop_separation', input.crop?.separacion)

  if (input.totalConcentration != null && !Number.isNaN(input.totalConcentration)) {
    formData.append('total_concentration', String(input.totalConcentration))
  }

  let response: Response
  try {
    response = await fetch(`${ANALYSIS_API_URL}/api/v1/analysis/process`, {
      method: 'POST',
      body: formData,
    })
  } catch {
    throw new Error(`No se pudo conectar con el backend en ${ANALYSIS_API_URL}.`)
  }

  if (!response.ok) {
    let detail = response.statusText
    try {
      const payload = await response.json() as { detail?: string }
      detail = payload.detail ?? detail
    } catch {
      // Mantener detalle por defecto si la respuesta no es JSON.
    }

    throw new Error(detail || 'El backend rechazo la solicitud de procesamiento.')
  }

  return await response.json() as BackendProcessorResult
}


