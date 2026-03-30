from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np

from .calibration import ProcessorCalibration, get_calibration
from .schemas import FractionKey


@dataclass(frozen=True)
class SyntheticCase:
    name: str
    description: str
    dominant_fraction: FractionKey
    total_concentration: float
    amplitudes: dict[FractionKey, float]
    widths: dict[FractionKey, float]


def _window_centers(calibration: ProcessorCalibration) -> dict[FractionKey, float]:
    return {
        window.key: (window.start + window.end) / 2.0
        for window in calibration.fraction_windows
    }


def synthetic_cases(calibration: ProcessorCalibration | None = None) -> tuple[SyntheticCase, ...]:
    active_calibration = calibration or get_calibration()
    default_widths = {
        window.key: max((window.end - window.start) / 3.2, 0.026)
        for window in active_calibration.fraction_windows
    }

    return (
        SyntheticCase(
            name="normal_reference",
            description="Perfil sintetico con albumina predominante y gamma moderada.",
            dominant_fraction="albumina",
            total_concentration=6.8,
            amplitudes={
                "albumina": 1.45,
                "alfa_1": 0.22,
                "alfa_2": 0.42,
                "beta_1": 0.32,
                "beta_2": 0.20,
                "gamma": 0.36,
            },
            widths=default_widths,
        ),
        SyntheticCase(
            name="gamma_spike_reference",
            description="Perfil sintetico con pico monoclonal estrecho en gamma.",
            dominant_fraction="gamma",
            total_concentration=8.2,
            amplitudes={
                "albumina": 1.18,
                "alfa_1": 0.20,
                "alfa_2": 0.34,
                "beta_1": 0.22,
                "beta_2": 0.18,
                "gamma": 1.60,
            },
            widths={
                **default_widths,
                "albumina": 0.055,
                "gamma": 0.030,
            },
        ),
        SyntheticCase(
            name="beta_gamma_bridge_reference",
            description="Perfil sintetico con puente beta-gamma y fracciones intermedias elevadas.",
            dominant_fraction="albumina",
            total_concentration=7.4,
            amplitudes={
                "albumina": 1.30,
                "alfa_1": 0.18,
                "alfa_2": 0.36,
                "beta_1": 0.50,
                "beta_2": 0.58,
                "gamma": 0.70,
            },
            widths={
                **default_widths,
                "beta_1": 0.050,
                "beta_2": 0.060,
                "gamma": 0.075,
            },
        ),
    )


def build_synthetic_signal(
    case: SyntheticCase,
    calibration: ProcessorCalibration | None = None,
    *,
    length: int = 720,
) -> np.ndarray:
    active_calibration = calibration or get_calibration()
    centers = _window_centers(active_calibration)
    x_axis = np.linspace(0.0, 1.0, length)
    signal = np.full(length, 0.025, dtype=np.float64)

    for fraction_key, center in centers.items():
        amplitude = case.amplitudes.get(fraction_key, 0.0)
        width = case.widths.get(fraction_key, 0.04)
        if amplitude <= 0 or width <= 0:
            continue
        component = amplitude * np.exp(-0.5 * np.square((x_axis - center) / width))
        signal += component

    signal += np.linspace(0.018, 0.0, length)
    peak = float(signal.max(initial=0.0))
    if peak <= 0:
        raise ValueError(f"El caso sintetico {case.name} genero una senal vacia.")
    return signal / peak


def render_signal_to_image(
    signal: np.ndarray,
    *,
    height: int = 180,
    lane_thickness: int = 70,
    noise_sigma: float = 3.0,
    seed: int = 7,
) -> np.ndarray:
    width = int(signal.size)
    image = np.full((height, width), 245, dtype=np.uint8)
    center_y = height // 2
    half_thickness = max(lane_thickness // 2, 10)
    top = max(0, center_y - half_thickness)
    bottom = min(height, center_y + half_thickness)

    darkness = np.clip((signal * 215.0) + 18.0, 0.0, 235.0).astype(np.uint8)
    lane = image[top:bottom, :]
    lane[:] = np.clip(lane.astype(np.int16) - darkness[np.newaxis, :], 0, 255).astype(np.uint8)

    rng = np.random.default_rng(seed)
    noise = rng.normal(0.0, noise_sigma, size=image.shape)
    noisy = np.clip(image.astype(np.float64) + noise, 0.0, 255.0).astype(np.uint8)
    blurred = cv2.GaussianBlur(noisy, (5, 5), 0)
    return cv2.cvtColor(blurred, cv2.COLOR_GRAY2BGR)


def encode_png(image: np.ndarray) -> bytes:
    encoded, buffer = cv2.imencode(".png", image)
    if not encoded:
        raise ValueError("No se pudo codificar la imagen sintetica en PNG.")
    return buffer.tobytes()
