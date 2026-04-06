import { supabase } from './supabase'

export const ELECTROFORESIS_BUCKET = 'electroforesis-imagenes'

export type CropSettings = {
  izquierda: string
  arriba: string
  ancho: string
  alto: string
  separacion: string
}

export type CropPayload = {
  izquierda: number | null
  arriba: number | null
  ancho: number | null
  alto: number | null
  separacion: number | null
}

export type ProcessorImageDraft = {
  nombre: string
  tipo: string
  crop: CropSettings
  storagePath?: string | null
}

export type ResultadoCrudo = {
  processor_status: 'pending' | 'manual_review' | 'processed' | 'failed'
  last_step: 'sample_selected' | 'sample_uploaded' | 'sample_upload_failed' | 'analysis_saved'
  algorithm_version: string | null
  input_images: Array<{
    nombre: string
    tipo: string
    storage_path: string | null
    crop: CropPayload
  }>
}

export const emptyCropSettings: CropSettings = {
  izquierda: '0',
  arriba: '0',
  ancho: '35',
  alto: '100',
  separacion: '',
}

function toNullableNumber(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return null

  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function sanitizeFileName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]+/g, '-')
}

export function normalizeCropSettings(crop: CropSettings): CropPayload {
  return {
    izquierda: toNullableNumber(crop.izquierda),
    arriba: toNullableNumber(crop.arriba),
    ancho: toNullableNumber(crop.ancho),
    alto: toNullableNumber(crop.alto),
    separacion: toNullableNumber(crop.separacion),
  }
}

export function buildResultadoCrudo(
  images: ProcessorImageDraft[],
  overrides: Partial<Omit<ResultadoCrudo, 'input_images'>> = {},
): ResultadoCrudo {
  return {
    processor_status: 'pending',
    last_step: 'sample_selected',
    algorithm_version: null,
    input_images: images.map(image => ({
      nombre: image.nombre,
      tipo: image.tipo,
      storage_path: image.storagePath ?? null,
      crop: normalizeCropSettings(image.crop),
    })),
    ...overrides,
  }
}

export async function uploadAnalisisImage(analisisId: string, file: File) {
  const storagePath = `${analisisId}/${crypto.randomUUID()}-${sanitizeFileName(file.name)}`

  const { error } = await supabase
    .storage
    .from(ELECTROFORESIS_BUCKET)
    .upload(storagePath, file, { upsert: false })

  if (error) {
    throw new Error(error.message)
  }

  return storagePath
}

export async function createSignedAnalisisImageUrl(storagePath: string) {
  const { data, error } = await supabase
    .storage
    .from(ELECTROFORESIS_BUCKET)
    .createSignedUrl(storagePath, 60 * 60)

  if (error) {
    return ''
  }

  return data.signedUrl
}

export async function createCroppedAnalisisImagePreview(imageUrl: string, crop: CropPayload | null | undefined) {
  const left = crop?.izquierda ?? null
  const top = crop?.arriba ?? null
  const width = crop?.ancho ?? null
  const height = crop?.alto ?? null

  if (
    left == null || top == null || width == null || height == null ||
    !Number.isFinite(left) || !Number.isFinite(top) ||
    !Number.isFinite(width) || !Number.isFinite(height) ||
    width <= 0 || height <= 0
  ) {
    return imageUrl
  }

  try {
    const response = await fetch(imageUrl)
    if (!response.ok) return imageUrl

    const blob = await response.blob()
    const bitmap = await createImageBitmap(blob)

    const cropLeft = clamp(Math.floor(left), 0, Math.max(0, bitmap.width - 1))
    const cropTop = clamp(Math.floor(top), 0, Math.max(0, bitmap.height - 1))
    const cropWidth = clamp(Math.floor(width), 1, Math.max(1, bitmap.width - cropLeft))
    const cropHeight = clamp(Math.floor(height), 1, Math.max(1, bitmap.height - cropTop))

    const canvas = document.createElement('canvas')
    canvas.width = cropWidth
    canvas.height = cropHeight
    const context = canvas.getContext('2d')
    if (!context) {
      bitmap.close()
      return imageUrl
    }

    context.drawImage(
      bitmap,
      cropLeft,
      cropTop,
      cropWidth,
      cropHeight,
      0,
      0,
      cropWidth,
      cropHeight,
    )
    bitmap.close()

    return canvas.toDataURL('image/png')
  } catch {
    return imageUrl
  }
}
