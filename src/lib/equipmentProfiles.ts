export type ProcessorEquipmentProfileKey =
  | 'generic_image'
  | 'sebia_agarose_image'
  | 'sebia_capillary_image'

export type ProcessorEquipmentProfile = {
  key: ProcessorEquipmentProfileKey
  label: string
  origin: string | null
  model: string | null
  usesSebiaAgaroseGuardrails: boolean
  prefersCurveInput: boolean
}

const SEBIA_BRAND_TOKEN = 'SEBIA'
const SEBIA_AGAROSE_MODEL_TOKENS = ['HYDRASYS', 'HYDRAGEL']
const SEBIA_CAPILLARY_MODEL_TOKENS = ['CAPILLARYS', 'MINICAP']

export function normalizeEquipmentText(value: string | null | undefined) {
  if (!value) return ''
  return value.trim().toUpperCase().replace(/\s+/g, ' ')
}

export function resolveProcessingEquipmentProfile(
  origin: string | null | undefined,
  model: string | null | undefined,
): ProcessorEquipmentProfile {
  const normalizedOrigin = normalizeEquipmentText(origin)
  const normalizedModel = normalizeEquipmentText(model)
  const combined = [normalizedOrigin, normalizedModel].filter(Boolean).join(' ')
  const isSebia = combined.includes(SEBIA_BRAND_TOKEN)

  if (SEBIA_CAPILLARY_MODEL_TOKENS.some(token => combined.includes(token))) {
    return {
      key: 'sebia_capillary_image',
      label: 'SEBIA capilar (imagen preliminar)',
      origin: origin?.trim() || null,
      model: model?.trim() || null,
      usesSebiaAgaroseGuardrails: false,
      prefersCurveInput: true,
    }
  }

  if (SEBIA_AGAROSE_MODEL_TOKENS.some(token => combined.includes(token))) {
    return {
      key: 'sebia_agarose_image',
      label: 'SEBIA gel / agarosa',
      origin: origin?.trim() || null,
      model: model?.trim() || null,
      usesSebiaAgaroseGuardrails: true,
      prefersCurveInput: false,
    }
  }

  if (isSebia) {
    return {
      key: 'generic_image',
      label: 'SEBIA no especificado (sin guardrails de metodo)',
      origin: origin?.trim() || null,
      model: model?.trim() || null,
      usesSebiaAgaroseGuardrails: false,
      prefersCurveInput: true,
    }
  }

  return {
    key: 'generic_image',
    label: 'Perfil generico por imagen',
    origin: origin?.trim() || null,
    model: model?.trim() || null,
    usesSebiaAgaroseGuardrails: false,
    prefersCurveInput: false,
  }
}
