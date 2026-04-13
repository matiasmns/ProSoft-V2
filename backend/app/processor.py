from __future__ import annotations

import cv2
import numpy as np
from scipy.ndimage import gaussian_filter1d
from scipy.signal import find_peaks

from .calibration import ProcessorCalibration, get_calibration
from .schemas import CropPayload, FractionKey, FractionResult, ProcessAnalysisResponse, ProfilePoint, SizePayload


ALGORITHM_VERSION = "fastapi-opencv-v3.2-calibrated"

FRACTION_KEYS: tuple[FractionKey, ...] = ("albumina", "alfa_1", "alfa_2", "beta_1", "beta_2", "gamma")

# v3 does not infer all limits from detected peaks. It searches for plausible valleys
# in stable SPEP regions and fails soft with warnings when the curve is ambiguous.
BOUNDARY_WINDOWS: tuple[tuple[float, float], ...] = (
    (0.50, 0.60),  # Albumina / Alfa 1
    (0.56, 0.66),  # Alfa 1 / Alfa 2
    (0.66, 0.76),  # Alfa 2 / Beta 1
    (0.73, 0.82),  # Beta 1 / Beta 2
    (0.72, 0.87),  # Beta 2 / Gamma  — calibrado 5 muestras: promedio real 80.5%, ventana corregida
)
EARLY_PROFILE_BOUNDARY_WINDOWS: tuple[tuple[float, float], ...] = (
    (0.28, 0.46),
    (0.50, 0.61),
    (0.58, 0.68),
    (0.65, 0.75),
    (0.72, 0.87),
)
EARLY_ALBUMIN_PEAK_RATIO = 0.24
MIN_FRACTION_WIDTH_RATIOS = (0.24, 0.025, 0.055, 0.035, 0.035, 0.08)
CALIBRATED_BOUNDARY_OFFSETS = (0.0, 0.005, 0.02, 0.0, 0.0)
FAR_RIGHT_GAMMA_BOUNDARY_RATIO = 0.875
FAR_RIGHT_GAMMA_BOUNDARY_OFFSET = -0.09

PROJECTION_TOP_FRACTION = 0.38
MIN_SIGNAL_DYNAMIC_RANGE = 0.035
HIGH_VALLEY_WARNING_LEVEL = 0.34


def clamp(value: int, minimum: int, maximum: int) -> int:
    return min(max(value, minimum), maximum)


def decode_image(contents: bytes) -> np.ndarray:
    np_buffer = np.frombuffer(contents, dtype=np.uint8)
    image = cv2.imdecode(np_buffer, cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("No se pudo decodificar la imagen enviada al backend.")
    return image


def build_crop_rect(crop_left: int | None, crop_top: int | None, crop_width: int | None, crop_height: int | None, width: int, height: int) -> CropPayload:
    left = clamp(int(crop_left or 0), 0, max(0, width - 1))
    top = clamp(int(crop_top or 0), 0, max(0, height - 1))
    requested_width = int(crop_width or width)
    requested_height = int(crop_height or height)
    final_width = clamp(requested_width if requested_width > 0 else width - left, 1, max(1, width - left))
    final_height = clamp(requested_height if requested_height > 0 else height - top, 1, max(1, height - top))
    return CropPayload(left=left, top=top, width=final_width, height=final_height)


def prepare_grayscale(image: np.ndarray, calibration: ProcessorCalibration) -> np.ndarray:
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY).astype(np.float64) / 255.0
    kernel_size = calibration.gaussian_blur_kernel_size
    if kernel_size > 1:
        gray = cv2.GaussianBlur(gray, (kernel_size, kernel_size), 0)
    return gray


def robust_projection(gray: np.ndarray, axis: str) -> np.ndarray:
    darkness = 1.0 - gray
    if axis == "x":
        cross_length = darkness.shape[0]
        top_count = max(1, int(round(cross_length * PROJECTION_TOP_FRACTION)))
        sorted_values = np.sort(darkness, axis=0)
        return sorted_values[-top_count:, :].mean(axis=0)

    cross_length = darkness.shape[1]
    top_count = max(1, int(round(cross_length * PROJECTION_TOP_FRACTION)))
    sorted_values = np.sort(darkness, axis=1)
    return sorted_values[:, -top_count:].mean(axis=1)


def normalize_signal(raw_signal: np.ndarray, calibration: ProcessorCalibration) -> np.ndarray:
    if raw_signal.size < 4:
        raise ValueError("La imagen recortada es demasiado chica para extraer un densitograma.")

    signal = raw_signal.astype(np.float64)
    dynamic_range = float(np.percentile(signal, 98) - np.percentile(signal, 2))
    if dynamic_range < MIN_SIGNAL_DYNAMIC_RANGE:
        raise ValueError("La imagen no contiene suficiente contraste para extraer una senal util.")

    baseline = float(np.percentile(signal, 5))
    corrected = np.clip(signal - baseline, 0.0, None)
    sigma = max(calibration.smoothing_sigma_min, corrected.size / calibration.smoothing_sigma_divisor)
    smooth = gaussian_filter1d(corrected, sigma=sigma, mode="nearest")
    smooth = np.clip(smooth - float(np.percentile(smooth, 2)), 0.0, None)

    if calibration.signal_floor > 0:
        smooth = np.clip(smooth - calibration.signal_floor * float(smooth.max(initial=0.0)), 0.0, None)

    peak = float(smooth.max(initial=0.0))
    if peak <= 0:
        raise ValueError("La imagen no contiene una senal util para el procesamiento.")

    normalized = smooth / peak
    normalized[0] = 0.0
    normalized[-1] = 0.0
    return normalized


def detect_peaks(signal: np.ndarray, calibration: ProcessorCalibration) -> np.ndarray:
    distance = max(calibration.peak_distance_min, signal.size // calibration.peak_distance_divisor)
    peaks, _ = find_peaks(signal, prominence=calibration.peak_prominence, distance=distance)
    return peaks


def find_peak_index(signal: np.ndarray, start: int, end: int) -> int:
    safe_start = clamp(start, 0, max(0, signal.size - 1))
    safe_end = clamp(end, safe_start, max(0, signal.size - 1))
    return safe_start + int(np.argmax(signal[safe_start : safe_end + 1]))


def find_local_valley(signal: np.ndarray, start_ratio: float, end_ratio: float, lower: int, upper: int) -> int:
    max_index = max(signal.size - 1, 0)
    start = max(lower, clamp(int(round(start_ratio * max_index)), 0, max_index))
    end = min(upper, clamp(int(round(end_ratio * max_index)), start, max_index))
    if end <= start:
        return clamp(start, lower, upper)

    best_index = start
    best_score = float("inf")
    midpoint = (start + end) / 2.0
    half_width = max((end - start) / 2.0, 1.0)

    for index in range(start, end + 1):
        previous_value = float(signal[index - 1]) if index > 0 else float(signal[index])
        current_value = float(signal[index])
        next_value = float(signal[index + 1]) if index < max_index else float(signal[index])
        local_shape_penalty = 0.0 if current_value <= previous_value and current_value <= next_value else 0.02
        center_penalty = abs(index - midpoint) / half_width * 0.01
        score = current_value + local_shape_penalty + center_penalty
        if score < best_score:
            best_score = score
            best_index = index

    return best_index


def build_boundaries(signal: np.ndarray) -> list[int]:
    max_index = max(signal.size - 1, 0)
    min_gap = max(2, signal.size // 160)
    boundaries = [0]
    albumin_peak = find_peak_index(signal, 0, int(round(0.40 * max_index)))
    albumin_peak_ratio = albumin_peak / max(max_index, 1)

    active_windows = EARLY_PROFILE_BOUNDARY_WINDOWS if albumin_peak_ratio < EARLY_ALBUMIN_PEAK_RATIO else BOUNDARY_WINDOWS

    for boundary_index, window in enumerate(active_windows):
        remaining_boundaries = len(BOUNDARY_WINDOWS) - boundary_index
        current_min_width = int(round(MIN_FRACTION_WIDTH_RATIOS[boundary_index] * max_index))
        future_min_width = int(round(sum(MIN_FRACTION_WIDTH_RATIOS[boundary_index + 1 :]) * max_index))
        lower = max(boundaries[-1] + min_gap, boundaries[-1] + current_min_width)
        upper = min(max_index - remaining_boundaries * min_gap, max_index - future_min_width)
        upper = max(lower, upper)
        boundary = find_local_valley(signal, window[0], window[1], lower, upper)
        offset = CALIBRATED_BOUNDARY_OFFSETS[boundary_index]
        if boundary_index == 4 and boundary / max(max_index, 1) >= FAR_RIGHT_GAMMA_BOUNDARY_RATIO:
            offset += FAR_RIGHT_GAMMA_BOUNDARY_OFFSET
        boundary = clamp(boundary + int(round(offset * max_index)), lower, upper)
        boundaries.append(boundary)

    boundaries.append(max_index)
    return boundaries


def trapz_area(signal: np.ndarray, start: int, end: int) -> float:
    if end <= start:
        return 0.0
    return float(np.trapezoid(signal[start : end + 1]))


def downsample(signal: np.ndarray, max_points: int) -> list[ProfilePoint]:
    if signal.size <= max_points:
        indices = np.arange(signal.size)
    else:
        indices = np.linspace(0, signal.size - 1, max_points, dtype=int)

    denominator = max(signal.size - 1, 1)
    return [ProfilePoint(x=float(index / denominator), y=float(signal[index])) for index in indices]


def build_fractions(signal: np.ndarray, boundaries: list[int], total_concentration: float | None) -> dict[FractionKey, FractionResult]:
    total_area = trapz_area(signal, boundaries[0], boundaries[-1])
    if total_area <= 0:
        raise ValueError("No fue posible integrar una senal valida para el estudio.")

    fractions: dict[FractionKey, FractionResult] = {}
    for index, key in enumerate(FRACTION_KEYS):
        start = boundaries[index]
        end = boundaries[index + 1]
        area = trapz_area(signal, start, end)
        percentage = round((area / total_area) * 100.0, 2)
        concentration = round((percentage * total_concentration) / 100.0, 2) if total_concentration is not None else None
        fractions[key] = FractionResult(
            start=start,
            end=end,
            peak_index=find_peak_index(signal, start, end),
            area=round(area, 4),
            percentage=percentage,
            concentration=concentration,
        )

    return fractions


def build_warnings(
    *,
    crop: CropPayload,
    calibration: ProcessorCalibration,
    detected_peaks: np.ndarray,
    signal: np.ndarray,
    boundaries: list[int],
) -> list[str]:
    warnings: list[str] = []
    warnings.append("Motor v3.2 calibrado: resultado automatico preliminar; validar con revision manual o PDF antes de informar.")

    if crop.width < calibration.crop_warning_min_width or crop.height < calibration.crop_warning_min_height:
        warnings.append("El recorte es pequeno y puede degradar la estimacion.")
    if detected_peaks.size < calibration.expected_peak_warning_threshold:
        warnings.append("Se detectaron pocos picos; revisar imagen y parametros.")

    internal_boundaries = boundaries[1:-1]
    high_valleys = [boundary for boundary in internal_boundaries if float(signal[boundary]) >= HIGH_VALLEY_WARNING_LEVEL]
    if high_valleys:
        warnings.append("Uno o mas separadores caen en valles poco definidos; revisar posiciones manualmente.")

    return warnings


def process_electrophoresis_image(
    contents: bytes,
    *,
    crop_left: int | None = None,
    crop_top: int | None = None,
    crop_width: int | None = None,
    crop_height: int | None = None,
    total_concentration: float | None = None,
    calibration: ProcessorCalibration | None = None,
) -> ProcessAnalysisResponse:
    active_calibration = calibration or get_calibration()
    image = decode_image(contents)
    height, width = image.shape[:2]
    crop = build_crop_rect(crop_left, crop_top, crop_width, crop_height, width, height)

    gray = prepare_grayscale(image, active_calibration)
    cropped = gray[crop.top : crop.top + crop.height, crop.left : crop.left + crop.width]
    axis = "x" if crop.width >= crop.height else "y"
    raw_signal = robust_projection(cropped, axis)
    signal = normalize_signal(raw_signal, active_calibration)

    detected_peaks = detect_peaks(signal, active_calibration)
    boundaries = build_boundaries(signal)
    fractions = build_fractions(signal, boundaries, total_concentration)
    peaks = [fractions[key].peak_index for key in FRACTION_KEYS]
    valleys = boundaries[1:-1]
    total_area = trapz_area(signal, boundaries[0], boundaries[-1])
    warnings = build_warnings(
        crop=crop,
        calibration=active_calibration,
        detected_peaks=detected_peaks,
        signal=signal,
        boundaries=boundaries,
    )

    return ProcessAnalysisResponse(
        algorithm_version=ALGORITHM_VERSION,
        calibration_profile=active_calibration.profile_name,
        calibration_version=active_calibration.profile_version,
        axis=axis,
        image_size=SizePayload(width=width, height=height),
        crop_used=crop,
        profile_length=int(signal.size),
        detected_peaks=int(detected_peaks.size),
        peaks=peaks,
        valleys=valleys,
        total_area=round(total_area, 4),
        profile=downsample(signal, active_calibration.profile_downsample_points),
        fractions=fractions,
        warning=" ".join(warnings) if warnings else None,
    )
