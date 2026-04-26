from __future__ import annotations

import cv2
import numpy as np
from scipy.ndimage import gaussian_filter1d, minimum_filter1d
from scipy.signal import find_peaks

from .calibration import ProcessorCalibration, get_calibration
from .schemas import CropPayload, FractionKey, FractionResult, ProcessAnalysisResponse, ProfilePoint, SizePayload


ALGORITHM_VERSION = "fastapi-opencv-v3.6-calibrated-boundaries"

FRACTION_KEYS: tuple[FractionKey, ...] = ("albumina", "alfa_1", "alfa_2", "beta_1", "beta_2", "gamma")


def clamp(value: int, minimum: int, maximum: int) -> int:
    return min(max(value, minimum), maximum)


def clamp_ratio(value: float, minimum: float, maximum: float) -> float:
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


def robust_projection(gray: np.ndarray, axis: str, calibration: ProcessorCalibration) -> np.ndarray:
    darkness = 1.0 - gray
    if axis == "x":
        cross_length = darkness.shape[0]
        top_count = max(1, int(round(cross_length * calibration.projection_top_fraction)))
        sorted_values = np.sort(darkness, axis=0)
        return sorted_values[-top_count:, :].mean(axis=0)

    cross_length = darkness.shape[1]
    top_count = max(1, int(round(cross_length * calibration.projection_top_fraction)))
    sorted_values = np.sort(darkness, axis=1)
    return sorted_values[:, -top_count:].mean(axis=1)


def finalize_normalized_signal(corrected: np.ndarray, calibration: ProcessorCalibration) -> np.ndarray:
    sigma = max(calibration.smoothing_sigma_min, corrected.size / calibration.smoothing_sigma_divisor)
    smooth = gaussian_filter1d(corrected, sigma=sigma, mode="nearest")
    smooth = np.clip(smooth - float(np.percentile(smooth, calibration.residual_baseline_percentile * 100.0)), 0.0, None)

    if calibration.signal_floor > 0:
        smooth = np.clip(smooth - calibration.signal_floor * float(smooth.max(initial=0.0)), 0.0, None)

    peak = float(smooth.max(initial=0.0))
    if peak <= 0:
        raise ValueError("La imagen no contiene una senal util para el procesamiento.")

    normalized = smooth / peak
    normalized[0] = 0.0
    normalized[-1] = 0.0
    return normalized


def normalize_with_global_baseline(signal: np.ndarray, calibration: ProcessorCalibration) -> np.ndarray:
    baseline = float(np.percentile(signal, calibration.global_baseline_percentile * 100.0))
    corrected = np.clip(signal - baseline, 0.0, None)
    return finalize_normalized_signal(corrected, calibration)


def normalize_with_local_baseline(signal: np.ndarray, calibration: ProcessorCalibration) -> np.ndarray:
    window = max(calibration.baseline_window_min, signal.size // calibration.baseline_window_divisor)
    if window % 2 == 0:
        window += 1

    rolling_min = minimum_filter1d(signal, size=window, mode="nearest")
    baseline = gaussian_filter1d(rolling_min, sigma=window / 2.0, mode="nearest")
    corrected = np.clip(signal - baseline, 0.0, None)
    return finalize_normalized_signal(corrected, calibration)


def local_baseline_preserves_shape(raw_signal: np.ndarray, normalized: np.ndarray, calibration: ProcessorCalibration) -> bool:
    max_index = max(raw_signal.size - 1, 1)
    raw_peak_index = int(np.argmax(raw_signal))
    normalized_peak_index = int(np.argmax(normalized))
    max_peak_shift = max(3, int(round(max_index * calibration.local_baseline_max_peak_shift_ratio)))

    if abs(raw_peak_index - normalized_peak_index) > max_peak_shift:
        return False

    if float(np.std(raw_signal)) <= 0.0 or float(np.std(normalized)) <= 0.0:
        return False

    correlation = float(np.corrcoef(raw_signal, normalized)[0, 1])
    return np.isfinite(correlation) and correlation >= calibration.local_baseline_min_correlation


def normalize_signal(raw_signal: np.ndarray, calibration: ProcessorCalibration) -> np.ndarray:
    if raw_signal.size < 4:
        raise ValueError("La imagen recortada es demasiado chica para extraer un densitograma.")

    signal = raw_signal.astype(np.float64)
    dynamic_range = float(np.percentile(signal, 98) - np.percentile(signal, 2))
    if dynamic_range < calibration.min_signal_dynamic_range:
        raise ValueError("La imagen no contiene suficiente contraste para extraer una senal util.")

    global_normalized = normalize_with_global_baseline(signal, calibration)
    local_normalized = normalize_with_local_baseline(signal, calibration)

    if local_baseline_preserves_shape(signal, local_normalized, calibration):
        return local_normalized

    return global_normalized


def detect_peaks(signal: np.ndarray, calibration: ProcessorCalibration) -> np.ndarray:
    distance = max(calibration.peak_distance_min, signal.size // calibration.peak_distance_divisor)
    peaks, _ = find_peaks(signal, prominence=calibration.peak_prominence, distance=distance)
    return peaks


def find_peak_index(signal: np.ndarray, start: int, end: int) -> int:
    safe_start = clamp(start, 0, max(0, signal.size - 1))
    safe_end = clamp(end, safe_start, max(0, signal.size - 1))
    return safe_start + int(np.argmax(signal[safe_start : safe_end + 1]))


def trapz_area(signal: np.ndarray, start: int, end: int) -> float:
    if end <= start:
        return 0.0
    return float(np.trapezoid(signal[start : end + 1]))


def min_gap_for(sample_count: int) -> int:
    base_gap = 4 if sample_count >= 180 else 3 if sample_count >= 90 else 2
    max_index = max(0, sample_count - 1)
    feasible_gap = max(1, max_index // max(1, len(FRACTION_KEYS)))
    return min(base_gap, feasible_gap)


def normalize_boundary_indices(indices: list[int], sample_count: int) -> list[int]:
    max_index = max(0, sample_count - 1)
    if max_index == 0:
        return [0 for _ in range(len(FRACTION_KEYS) + 1)]

    min_gap = min_gap_for(sample_count)
    normalized = list(indices)
    normalized[0] = 0
    normalized[-1] = max_index

    for index in range(len(normalized)):
        min_allowed = 0 if index == 0 else normalized[index - 1] + min_gap
        max_allowed = max_index - ((len(normalized) - 1 - index) * min_gap)
        normalized[index] = clamp(normalized[index], min_allowed, max_allowed)

    for index in range(len(normalized) - 2, -1, -1):
        max_allowed = normalized[index + 1] - min_gap
        min_allowed = 0 if index == 0 else normalized[index - 1] + min_gap
        normalized[index] = clamp(normalized[index], min_allowed, max_allowed)

    normalized[0] = 0
    normalized[-1] = max_index
    return normalized


def build_area_percentages(signal: np.ndarray, boundaries: list[int]) -> list[float]:
    total_area = trapz_area(signal, boundaries[0], boundaries[-1])
    safe_total_area = total_area if total_area > 0 else 1.0
    return [
        (trapz_area(signal, boundaries[index], boundaries[index + 1]) / safe_total_area) * 100.0
        for index in range(len(FRACTION_KEYS))
    ]


def measure_target_error(signal: np.ndarray, boundaries: list[int], target_percentages: list[float]) -> tuple[float, float]:
    percentages = build_area_percentages(signal, boundaries)
    errors = [abs(percentage - target) for percentage, target in zip(percentages, target_percentages)]
    return float(sum(errors)), float(max(errors, default=0.0))


def find_nearest_reference_valley(
    values: np.ndarray,
    target_index: int,
    min_allowed: int,
    max_allowed: int,
    calibration: ProcessorCalibration,
) -> int:
    max_index = max(0, values.size - 1)
    safe_min = clamp(min_allowed, 0, max_index)
    safe_max = clamp(max_allowed, safe_min, max_index)
    safe_target = clamp(target_index, safe_min, safe_max)
    radius = max(2, int(round(max_index * calibration.reference_valley_snap_window_ratio)))
    start = max(safe_min, safe_target - radius)
    end = min(safe_max, safe_target + radius)

    best_index = safe_target
    best_score = float("inf")
    found_local_minimum = False

    for index in range(start, end + 1):
        previous = float(values[index - 1]) if index > 0 else float(values[index])
        current = float(values[index])
        next_value = float(values[index + 1]) if index < max_index else float(values[index])
        is_local_minimum = current <= previous and current <= next_value

        if not is_local_minimum and found_local_minimum:
            continue

        distance_penalty = abs(index - safe_target) / max(radius, 1) * 0.025
        score = current + distance_penalty

        if is_local_minimum and not found_local_minimum:
            found_local_minimum = True
            best_score = float("inf")

        if score < best_score:
            best_score = score
            best_index = index

    return best_index


def estimate_profile_shift_ratio(signal: np.ndarray, calibration: ProcessorCalibration) -> float:
    max_index = max(signal.size - 1, 1)
    albumin_window = calibration.fraction_windows[0]
    search_end_ratio = calibration.fraction_windows[min(1, len(calibration.fraction_windows) - 1)].end
    observed_peak = find_peak_index(signal, 0, int(round(search_end_ratio * max_index)))
    observed_peak_ratio = observed_peak / max_index
    expected_peak_ratio = albumin_window.start + ((albumin_window.end - albumin_window.start) * calibration.albumin_target_position_in_window)
    return clamp_ratio(
        observed_peak_ratio - expected_peak_ratio,
        -calibration.boundary_shift_limit_ratio,
        calibration.boundary_shift_limit_ratio,
    )


def fit_fraction_target_percentages(signal: np.ndarray, calibration: ProcessorCalibration) -> list[float]:
    x_axis = np.linspace(0.0, 1.0, signal.size)
    profile_shift_ratio = estimate_profile_shift_ratio(signal, calibration)
    basis_columns: list[np.ndarray] = []
    basis_owners: list[int] = []
    basis_areas: list[float] = []

    for fraction_index, window in enumerate(calibration.fraction_windows):
        center = clamp_ratio(((window.start + window.end) / 2.0) + profile_shift_ratio, 0.0, 1.0)
        base_width = max((window.end - window.start) / 3.2, calibration.gaussian_width_min_ratio)

        for scale in calibration.gaussian_width_scales:
            sigma = max(base_width * scale, calibration.gaussian_width_min_ratio * 0.6)
            basis = np.exp(-0.5 * np.square((x_axis - center) / sigma))
            basis_columns.append(basis)
            basis_owners.append(fraction_index)
            basis_areas.append(float(np.trapezoid(basis, x_axis)))

    if not basis_columns:
        equal_share = 100.0 / len(FRACTION_KEYS)
        return [equal_share for _ in FRACTION_KEYS]

    basis_matrix = np.stack(basis_columns, axis=1)
    weights = np.full(basis_matrix.shape[1], 0.1, dtype=np.float64)

    for _ in range(calibration.gaussian_fit_iterations):
        numerator = basis_matrix.T @ signal
        denominator = basis_matrix.T @ (basis_matrix @ weights) + calibration.gaussian_fit_epsilon
        weights *= numerator / denominator

    fraction_areas = np.zeros(len(FRACTION_KEYS), dtype=np.float64)
    for weight, owner, area in zip(weights, basis_owners, basis_areas):
        fraction_areas[owner] += weight * area

    total_area = float(fraction_areas.sum())
    if total_area <= 0:
        equal_share = 100.0 / len(FRACTION_KEYS)
        return [equal_share for _ in FRACTION_KEYS]

    return [float((area / total_area) * 100.0) for area in fraction_areas]


def build_boundaries(signal: np.ndarray, calibration: ProcessorCalibration | None = None) -> list[int]:
    active_calibration = calibration or get_calibration()
    target_percentages = fit_fraction_target_percentages(signal, active_calibration)
    sample_count = signal.size
    max_index = max(0, sample_count - 1)
    total_area = trapz_area(signal, 0, max_index)

    if total_area <= 0:
        even_boundaries = [int(round(index * max_index / len(FRACTION_KEYS))) for index in range(len(FRACTION_KEYS) + 1)]
        return normalize_boundary_indices(even_boundaries, sample_count)

    boundaries = [0]
    accumulated_target = 0.0
    running_area = 0.0
    cursor = 0

    for target_percentage in target_percentages[:-1]:
        accumulated_target += max(0.0, target_percentage) / 100.0
        target_area = accumulated_target * total_area
        boundary_index = max_index

        while cursor < max_index:
            segment_area = (float(signal[cursor]) + float(signal[cursor + 1])) / 2.0
            next_area = running_area + segment_area
            if next_area >= target_area:
                fraction_within_segment = 0.0 if segment_area <= 0 else (target_area - running_area) / segment_area
                boundary_index = clamp(cursor + int(round(clamp_ratio(fraction_within_segment, 0.0, 1.0))), 0, max_index)
                break
            running_area = next_area
            cursor += 1

        boundaries.append(boundary_index)

    boundaries.append(max_index)

    area_only = normalize_boundary_indices(boundaries, sample_count)
    snapped = area_only.copy()
    min_gap = min_gap_for(sample_count)

    for index in range(1, len(snapped) - 1):
        snapped[index] = find_nearest_reference_valley(
            signal,
            snapped[index],
            snapped[index - 1] + min_gap,
            snapped[index + 1] - min_gap,
            active_calibration,
        )

    area_only_total_error, _ = measure_target_error(signal, area_only, target_percentages)
    snapped_total_error, snapped_max_error = measure_target_error(signal, snapped, target_percentages)

    if (
        snapped_max_error > active_calibration.reference_max_fraction_error_after_snap
        or snapped_total_error > area_only_total_error + active_calibration.reference_max_total_error_increase_after_snap
    ):
        return area_only

    return normalize_boundary_indices(snapped, sample_count)


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
    warnings.append("Motor v3.6 calibrado: resultado automatico preliminar; validar con revision manual o PDF antes de informar.")

    if crop.width < calibration.crop_warning_min_width or crop.height < calibration.crop_warning_min_height:
        warnings.append("El recorte es pequeno y puede degradar la estimacion.")
    if detected_peaks.size < calibration.expected_peak_warning_threshold:
        warnings.append("Se detectaron pocos picos; revisar imagen y parametros.")

    internal_boundaries = boundaries[1:-1]
    high_valleys = [boundary for boundary in internal_boundaries if float(signal[boundary]) >= calibration.high_valley_warning_level]
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
    raw_signal = robust_projection(cropped, axis, active_calibration)
    signal = normalize_signal(raw_signal, active_calibration)

    detected_peaks = detect_peaks(signal, active_calibration)
    boundaries = build_boundaries(signal, active_calibration)
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
        profile_signal=[round(float(value), 6) for value in signal],
        profile=downsample(signal, active_calibration.profile_downsample_points),
        fractions=fractions,
        warning=" ".join(warnings) if warnings else None,
    )
