from __future__ import annotations

from dataclasses import dataclass


GENERIC_IMAGE_PROFILE_KEY = "generic_image"
SEBIA_AGAROSE_IMAGE_PROFILE_KEY = "sebia_agarose_image"
SEBIA_CAPILLARY_IMAGE_PROFILE_KEY = "sebia_capillary_image"

SEBIA_BRAND_TOKEN = "SEBIA"
SEBIA_AGAROSE_MODEL_TOKENS = ("HYDRASYS", "HYDRAGEL")
SEBIA_CAPILLARY_MODEL_TOKENS = ("CAPILLARYS", "MINICAP")


@dataclass(frozen=True)
class EquipmentProfileResolution:
    key: str
    label: str
    origin: str | None
    model: str | None
    uses_sebia_agarose_guardrails: bool = False
    prefers_curve_input: bool = False


def normalize_equipment_text(value: str | None) -> str:
    if not value:
        return ""
    return " ".join(value.strip().upper().split())


def resolve_equipment_profile(origin: str | None, model: str | None) -> EquipmentProfileResolution:
    normalized_origin = normalize_equipment_text(origin)
    normalized_model = normalize_equipment_text(model)
    normalized_combined = " ".join(part for part in (normalized_origin, normalized_model) if part)
    is_sebia = SEBIA_BRAND_TOKEN in normalized_combined

    if any(token in normalized_combined for token in SEBIA_CAPILLARY_MODEL_TOKENS):
        return EquipmentProfileResolution(
            key=SEBIA_CAPILLARY_IMAGE_PROFILE_KEY,
            label="SEBIA capilar (imagen preliminar)",
            origin=origin,
            model=model,
            prefers_curve_input=True,
        )

    if any(token in normalized_combined for token in SEBIA_AGAROSE_MODEL_TOKENS):
        return EquipmentProfileResolution(
            key=SEBIA_AGAROSE_IMAGE_PROFILE_KEY,
            label="SEBIA gel / agarosa",
            origin=origin,
            model=model,
            uses_sebia_agarose_guardrails=True,
        )

    if is_sebia:
        return EquipmentProfileResolution(
            key=SEBIA_AGAROSE_IMAGE_PROFILE_KEY,
            label="SEBIA no especificado (fallback gel/agarosa)",
            origin=origin,
            model=model,
            uses_sebia_agarose_guardrails=True,
        )

    return EquipmentProfileResolution(
        key=GENERIC_IMAGE_PROFILE_KEY,
        label="Perfil generico por imagen",
        origin=origin,
        model=model,
    )
