from __future__ import annotations

import cv2
import numpy as np
from scipy.ndimage import gaussian_filter1d, minimum_filter1d
from scipy.signal import find_peaks

from .calibration import FractionWindowConfig, ProcessorCalibration, get_calibration
from .schemas import CropPayload, FractionKey, FractionResult, ProcessAnalysisResponse, ProfilePoint, SizePayload


ALGORITHM_VERSION = "fastapi-opencv-v2.2"

REFERENCE_GUIDED_TARGETS = (0.583, 0.041, 0.110, 0.058, 0.053, 0.155)
ALBUMIN_GUARD_MIN_PERCENT = 45.0
ALBUMIN_GUARD_MAX_FIRST_BOUNDARY_RATIO = 0.42
ALBUMIN_GUARD_GAMMA_DOMINANCE_RATIO = 1.25


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
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    normalized = cv2.normalize(gray, None, alpha=0, beta=255, norm_type=cv2.NORM_MINMAX)
    grid_size = calibration.clahe_tile_grid_size
    clahe = cv2.createCLAHE(
        clipLimit=calibration.clahe_clip_limit,
        tileGridSize=(grid_size, grid_size),
    )
    enhanced = clahe.apply(normalized)
    kernel_size = calibration.gaussian_blur_kernel_size
    return cv2.GaussianBlur(enhanced, (kernel_size, kernel_size), 0)


def build_projection(gray: np.ndarray, axis: str) -> np.ndarray:
    inverted = 255.0 - gray.astype(np.float64)
    return inverted.mean(axis=0 if axis == "x" else 1)


def normalize_signal(raw_signal: np.ndarray, calibration: ProcessorCalibration) -> np.ndarray:
    smooth_sigma = max(calibration.smoothing_sigma_min, raw_signal.size / calibration.smoothing_sigma_divisor)
    smooth = gaussian_filter1d(raw_signal, sigma=smooth_sigma)
    baseline_size = max(calibration.baseline_window_min, raw_signal.size // calibration.baseline_window_divisor)
    if baseline_size % 2 == 0:
        baseline_size += 1
    baseline = minimum_filter1d(smooth, size=baseline_size, mode="nearest")
    corrected = np.clip(smooth - baseline, 0.0, None)
    peak = float(corrected.max(initial=0.0))
    if peak <= 0:
        raise ValueError("La imagen no contiene una senal util para el procesamiento.")

    normalized = corrected / peak
    if calibration.signal_floor > 0:
        normalized = np.clip(normalized - calibration.signal_floor, 0.0, None)
        adjusted_peak = float(normalized.max(initial=0.0))
        if adjusted_peak <= 0:
            raise ValueError("La imagen no contiene una senal util para el procesamiento.")
        normalized = normalized / adjusted_peak

    return normalized


def detect_peaks(signal: np.ndarray, calibration: ProcessorCalibration) -> np.ndarray:
    distance = max(calibration.peak_distance_min, signal.size // calibration.peak_distance_divisor)
    peaks, _ = find_peaks(signal, prominence=calibration.peak_prominence, distance=distance)
    return peaks


def choose_window_peaks(signal: np.ndarray, detected_peaks: np.ndarray, fraction_windows: tuple[FractionWindowConfig, ...]) -> list[int]:
    selected: list[int] = []
    length = signal.size - 1

    for window in fraction_windows:
        start = clamp(int(window.start * length), 0, length)
        end = clamp(int(window.end * length), start, length)
        peaks_in_window = [int(peak) for peak in detected_peaks if start <= peak <= end]

        if peaks_in_window:
            peak_index = max(peaks_in_window, key=lambda peak: float(signal[peak]))
        else:
            peak_index = start + int(np.argmax(signal[start : end + 1]))

        selected.append(peak_index)

    return selected


def find_valleys(signal: np.ndarray, peaks: list[int]) -> list[int]:
    valleys: list[int] = []
    for current, following in zip(peaks, peaks[1:]):
        if following <= current:
            valleys.append(current)
            continue
        if following - current <= 2:
            valleys.append(int(round((current + following) / 2)))
            continue
        segment = signal[current + 1 : following]
        valley = current + 1 + int(np.argmin(segment))
        valleys.append(valley)
    return valleys


def apply_valley_offsets(signal: np.ndarray, peaks: list[int], valleys: list[int], offsets: tuple[float, ...]) -> list[int]:
    if not offsets:
        return valleys

    max_index = max(signal.size - 1, 0)
    shifted: list[int] = []
    for index, valley in enumerate(valleys):
        offset = offsets[index] if index < len(offsets) else 0.0
        if index == len(valleys) - 1 and offset > 0 and peaks:
            albumin_peak = float(signal[peaks[0]])
            gamma_peak = float(signal[peaks[-1]])
            if gamma_peak >= albumin_peak * 1.2:
                offset = 0.0
        lower = peaks[index] + 1
        upper = peaks[index + 1] - 1
        if upper < lower:
            shifted.append(valley)
            continue
        shifted_valley = valley + int(round(offset * max_index))
        shifted.append(clamp(shifted_valley, lower, upper))
    return shifted


def build_area_target_valleys(signal: np.ndarray, targets: tuple[float, ...]) -> list[int]:
    max_index = max(signal.size - 1, 0)
    if max_index <= 0:
        return []

    total_area = trapz_area(signal, 0, max_index)
    if total_area <= 0:
        return []

    min_gap = max(2, signal.size // 150)
    valleys: list[int] = []
    accumulated_target = 0.0
    previous_index = 0

    for index, target in enumerate(targets[:-1]):
        accumulated_target += max(0.0, target)
        target_area = total_area * accumulated_target
        running_area = 0.0
        target_index = max_index

        for cursor in range(max_index):
            segment_area = float((signal[cursor] + signal[cursor + 1]) / 2.0)
            next_area = running_area + segment_area

            if next_area >= target_area:
                fraction_within_segment = (target_area - running_area) / segment_area if segment_area > 0 else 0.0
                target_index = clamp(cursor + int(round(np.clip(fraction_within_segment, 0.0, 1.0))), 0, max_index)
                break

            running_area = next_area

        remaining_boundaries = len(targets) - 1 - index
        min_allowed = previous_index + min_gap
        max_allowed = max_index - remaining_boundaries * min_gap
        target_index = clamp(target_index, min_allowed, max_allowed)
        valleys.append(target_index)
        previous_index = target_index

    return valleys


def apply_albumin_internal_split_guard(signal: np.ndarray, peaks: list[int], valleys: list[int]) -> tuple[list[int], str | None]:
    if len(valleys) != len(REFERENCE_GUIDED_TARGETS) - 1 or len(peaks) < len(REFERENCE_GUIDED_TARGETS):
        return valleys, None

    max_index = max(signal.size - 1, 1)
    total_area = trapz_area(signal, 0, max_index)
    if total_area <= 0:
        return valleys, None

    albumin_area = trapz_area(signal, 0, valleys[0])
    albumin_percent = (albumin_area / total_area) * 100.0
    first_boundary_ratio = valleys[0] / max_index

    if albumin_percent >= ALBUMIN_GUARD_MIN_PERCENT:
        return valleys, None
    if first_boundary_ratio >= ALBUMIN_GUARD_MAX_FIRST_BOUNDARY_RATIO:
        return valleys, None

    albumin_peak = float(signal[peaks[0]])
    gamma_peak = float(signal[peaks[-1]])
    if gamma_peak >= albumin_peak * ALBUMIN_GUARD_GAMMA_DOMINANCE_RATIO:
        return valleys, None

    guided_valleys = build_area_target_valleys(signal, REFERENCE_GUIDED_TARGETS)
    if len(guided_valleys) != len(valleys) or guided_valleys[0] <= valleys[0]:
        return valleys, None

    return guided_valleys, (
        "Se aplico correccion automatica por probable valle interno de albumina; "
        "validar separadores con revision manual o PDF."
    )


def trapz_area(signal: np.ndarray, start: int, end: int) -> float:
    if end <= start:
        return 0.0
    return float(np.trapezoid(signal[start : end + 1]))


def downsample(signal: np.ndarray, max_points: int = 240) -> list[ProfilePoint]:
    if signal.size <= max_points:
        indices = np.arange(signal.size)
    else:
        indices = np.linspace(0, signal.size - 1, max_points, dtype=int)

    denominator = max(signal.size - 1, 1)
    return [ProfilePoint(x=float(index / denominator), y=float(signal[index])) for index in indices]


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
    raw_signal = build_projection(cropped, axis)
    signal = normalize_signal(raw_signal, active_calibration)

    detected_peaks = detect_peaks(signal, active_calibration)
    peaks = choose_window_peaks(signal, detected_peaks, active_calibration.fraction_windows)
    valleys = apply_valley_offsets(signal, peaks, find_valleys(signal, peaks), active_calibration.valley_offsets)
    valleys, albumin_guard_warning = apply_albumin_internal_split_guard(signal, peaks, valleys)
    total_area = trapz_area(signal, 0, signal.size - 1)

    if total_area <= 0:
        raise ValueError("No fue posible integrar una senal valida para el estudio.")

    fractions: dict[FractionKey, FractionResult] = {}
    for index, window in enumerate(active_calibration.fraction_windows):
        start = 0 if index == 0 else valleys[index - 1]
        end = signal.size - 1 if index == len(active_calibration.fraction_windows) - 1 else valleys[index]
        area = trapz_area(signal, start, end)
        percentage = round((area / total_area) * 100.0, 2)
        concentration = round((percentage * total_concentration) / 100.0, 2) if total_concentration is not None else None
        fractions[window.key] = FractionResult(
            start=start,
            end=end,
            peak_index=peaks[index],
            area=round(area, 4),
            percentage=percentage,
            concentration=concentration,
        )

    warnings: list[str] = []
    if crop.width < active_calibration.crop_warning_min_width or crop.height < active_calibration.crop_warning_min_height:
        warnings.append("El recorte es pequeno y puede degradar la estimacion.")
    if detected_peaks.size < active_calibration.expected_peak_warning_threshold:
        warnings.append("Se detectaron pocos picos; revisar imagen y parametros.")
    if albumin_guard_warning:
        warnings.append(albumin_guard_warning)

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
