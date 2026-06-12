from __future__ import annotations

import cv2
import numpy as np
from scipy.ndimage import gaussian_filter1d, minimum_filter1d
from scipy.signal import find_peaks

from .calibration import ProcessorCalibration, get_calibration
from .equipment_profiles import (
    SEBIA_AGAROSE_IMAGE_PROFILE_KEY,
    SEBIA_CAPILLARY_IMAGE_PROFILE_KEY,
    EquipmentProfileResolution,
    resolve_equipment_profile,
)
from .schemas import CropPayload, FractionKey, FractionResult, ProcessAnalysisResponse, ProfilePoint, SizePayload


ALGORITHM_VERSION = "fastapi-opencv-v3.9-valley-boundary-audit"

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


def is_local_minimum(signal: np.ndarray, index: int) -> bool:
    if index <= 0 or index >= signal.size - 1:
        return False
    return float(signal[index]) <= float(signal[index - 1]) and float(signal[index]) <= float(signal[index + 1])


def valley_depth_at(signal: np.ndarray, index: int) -> float:
    if index <= 0 or index >= signal.size - 1:
        return 0.0
    previous = float(signal[index - 1])
    current = float(signal[index])
    next_value = float(signal[index + 1])
    outer_previous = float(signal[index - 2]) if index > 1 else previous
    outer_next = float(signal[index + 2]) if index < signal.size - 2 else next_value
    return max(0.0, max(previous, outer_previous) - current) + max(0.0, max(next_value, outer_next) - current)


def detect_valleys(signal: np.ndarray, calibration: ProcessorCalibration) -> list[int]:
    distance = max(3, signal.size // max(calibration.peak_distance_divisor * 2, 1))
    candidates: list[tuple[float, int]] = []

    for index in range(1, signal.size - 1):
        if not is_local_minimum(signal, index):
            continue
        depth = valley_depth_at(signal, index)
        if depth < 0.005 and float(signal[index]) > calibration.high_valley_warning_level:
            continue
        candidates.append((float(signal[index]) - (min(depth, 1.0) * 0.2), index))

    candidates.sort(key=lambda candidate: candidate[0])
    selected: list[int] = []
    for _, index in candidates:
        if all(abs(index - selected_index) >= distance for selected_index in selected):
            selected.append(index)

    return sorted(selected)


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
        outer_previous = float(values[index - 2]) if index > 1 else previous
        outer_next = float(values[index + 2]) if index < max_index - 1 else next_value
        is_local_minimum = current <= previous and current <= next_value

        if not is_local_minimum and found_local_minimum:
            continue

        local_depth = max(0.0, max(previous, outer_previous) - current) + max(0.0, max(next_value, outer_next) - current)
        distance_penalty = abs(index - safe_target) / max(radius, 1) * 0.03
        valley_bonus = min(local_depth, 1.0) * 0.18
        score = current + distance_penalty - valley_bonus

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
        selected = area_only
    else:
        selected = normalize_boundary_indices(snapped, sample_count)

    return refine_boundaries(signal, selected, target_percentages, active_calibration)


def boundary_objective(signal: np.ndarray, boundaries: list[int], target_percentages: list[float]) -> float:
    total_error, max_error = measure_target_error(signal, boundaries, target_percentages)
    internal_boundaries = boundaries[1:-1]

    if not internal_boundaries:
        return total_error + max_error

    valley_values = np.asarray([float(signal[index]) for index in internal_boundaries], dtype=np.float64)
    mean_valley = float(valley_values.mean())
    max_valley = float(valley_values.max())
    non_minimum_penalty = sum(1 for index in internal_boundaries if not is_local_minimum(signal, index)) * 2.0
    weak_valley_penalty = sum(max(0.0, 0.03 - valley_depth_at(signal, index)) for index in internal_boundaries) * 12.0
    return total_error + max_error + (mean_valley * 5.0) + (max_valley * 2.0) + non_minimum_penalty + weak_valley_penalty


def refine_boundaries(
    signal: np.ndarray,
    boundaries: list[int],
    target_percentages: list[float],
    calibration: ProcessorCalibration,
) -> list[int]:
    sample_count = signal.size
    if sample_count <= len(FRACTION_KEYS) + 1:
        return normalize_boundary_indices(boundaries, sample_count)

    max_index = max(sample_count - 1, 1)
    radius = max(2, int(round(max_index * calibration.reference_valley_snap_window_ratio)))
    min_gap = min_gap_for(sample_count)
    next_boundaries = normalize_boundary_indices(list(boundaries), sample_count)
    best_score = boundary_objective(signal, next_boundaries, target_percentages)

    for _ in range(3):
        changed = False

        for boundary_index in range(1, len(next_boundaries) - 1):
            current_index = next_boundaries[boundary_index]
            min_allowed = next_boundaries[boundary_index - 1] + min_gap
            max_allowed = next_boundaries[boundary_index + 1] - min_gap
            if min_allowed > max_allowed:
                continue

            search_start = max(min_allowed, current_index - radius)
            search_end = min(max_allowed, current_index + radius)
            best_boundary = current_index
            best_boundary_score = best_score

            for candidate in range(search_start, search_end + 1):
                if candidate == current_index:
                    continue

                candidate_boundaries = list(next_boundaries)
                candidate_boundaries[boundary_index] = candidate
                candidate_boundaries = normalize_boundary_indices(candidate_boundaries, sample_count)
                candidate_score = boundary_objective(signal, candidate_boundaries, target_percentages)

                if candidate_score + 1e-6 < best_boundary_score:
                    best_boundary = candidate_boundaries[boundary_index]
                    best_boundary_score = candidate_score

            if best_boundary != current_index:
                next_boundaries[boundary_index] = best_boundary
                next_boundaries = normalize_boundary_indices(next_boundaries, sample_count)
                best_score = best_boundary_score
                changed = True

        if not changed:
            break

    return normalize_boundary_indices(next_boundaries, sample_count)


def score_axis_candidate(
    signal: np.ndarray,
    detected_peaks: np.ndarray,
    boundaries: list[int],
    calibration: ProcessorCalibration,
) -> float:
    internal_boundaries = boundaries[1:-1]

    if internal_boundaries:
        valley_values = np.asarray([float(signal[index]) for index in internal_boundaries], dtype=np.float64)
        mean_valley = float(valley_values.mean())
        max_valley = float(valley_values.max())
        high_valley_count = sum(
            1
            for index in internal_boundaries
            if float(signal[index]) >= calibration.high_valley_warning_level
        )
    else:
        mean_valley = 1.0
        max_valley = 1.0
        high_valley_count = len(FRACTION_KEYS) - 1

    max_index = max(signal.size - 1, 1)
    early_peak_limit = int(round(calibration.fraction_windows[min(1, len(calibration.fraction_windows) - 1)].end * max_index))
    early_peak_value = float(signal[find_peak_index(signal, 0, early_peak_limit)])
    peak_count = int(detected_peaks.size)

    return (
        (early_peak_value * 4.5)
        - (mean_valley * 5.5)
        - (max_valley * 2.0)
        - (high_valley_count * 0.65)
        + (min(peak_count, 6) * 0.4)
        - (abs(peak_count - 5) * 0.25)
    )


def select_projection_axis(
    gray_image: np.ndarray,
    calibration: ProcessorCalibration,
) -> tuple[str, np.ndarray, np.ndarray, list[int]]:
    default_axis = "x" if gray_image.shape[1] >= gray_image.shape[0] else "y"
    candidates: list[tuple[float, str, np.ndarray, np.ndarray, list[int]]] = []
    errors: list[str] = []

    for axis in ("x", "y"):
        try:
            raw_signal = robust_projection(gray_image, axis, calibration)
            signal = normalize_signal(raw_signal, calibration)
            detected_peaks = detect_peaks(signal, calibration)
            boundaries = build_boundaries(signal, calibration)
            score = score_axis_candidate(signal, detected_peaks, boundaries, calibration)
            if axis == default_axis:
                score += 0.12
            candidates.append((score, axis, signal, detected_peaks, boundaries))
        except ValueError as exc:
            errors.append(str(exc))

    if not candidates:
        raise ValueError(errors[0] if errors else "No se pudo extraer una senal util para el estudio.")

    candidates.sort(key=lambda candidate: candidate[0], reverse=True)
    _, axis, signal, detected_peaks, boundaries = candidates[0]
    return axis, signal, detected_peaks, boundaries


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


def snap_boundary_to_ratio(
    signal: np.ndarray,
    boundaries: list[int],
    boundary_index: int,
    target_ratio: float,
    calibration: ProcessorCalibration,
) -> list[int]:
    if boundary_index <= 0 or boundary_index >= len(boundaries) - 1:
        return boundaries

    sample_count = signal.size
    max_index = max(sample_count - 1, 1)
    min_gap = min_gap_for(sample_count)
    target_index = clamp(int(round(clamp_ratio(target_ratio, 0.0, 1.0) * max_index)), 0, max_index)
    next_boundaries = normalize_boundary_indices(list(boundaries), sample_count)
    min_allowed = next_boundaries[boundary_index - 1] + min_gap
    max_allowed = next_boundaries[boundary_index + 1] - min_gap
    snapped_index = find_nearest_reference_valley(
        signal,
        clamp(target_index, min_allowed, max_allowed),
        min_allowed,
        max_allowed,
        calibration,
    )
    next_boundaries[boundary_index] = snapped_index
    return normalize_boundary_indices(next_boundaries, sample_count)


def apply_boundary_targets(
    signal: np.ndarray,
    boundaries: list[int],
    calibration: ProcessorCalibration,
    target_ratios: dict[int, float],
) -> list[int]:
    next_boundaries = normalize_boundary_indices(list(boundaries), signal.size)
    for boundary_index in sorted(target_ratios):
        next_boundaries = snap_boundary_to_ratio(
            signal,
            next_boundaries,
            boundary_index,
            target_ratios[boundary_index],
            calibration,
        )
    return next_boundaries


def apply_sebia_agarose_guardrails(
    signal: np.ndarray,
    boundaries: list[int],
    calibration: ProcessorCalibration,
) -> tuple[list[int], list[str]]:
    max_index = max(signal.size - 1, 1)
    next_boundaries = normalize_boundary_indices(list(boundaries), signal.size)
    adjustments: list[str] = []

    def read_metrics(current_boundaries: list[int]) -> tuple[list[float], list[float]]:
        percentages = build_area_percentages(signal, current_boundaries)
        separator_percentages = [
            (current_boundaries[index] / max_index) * 100.0
            for index in range(1, len(current_boundaries) - 1)
        ]
        return percentages, separator_percentages

    percentages, separator_percentages = read_metrics(next_boundaries)
    albumina, alfa_1, _, beta_1, _, gamma = percentages
    sep_1, _, _, sep_4, sep_5 = separator_percentages

    if alfa_1 >= 10.0 and albumina <= 50.0 and sep_1 <= 53.0:
        next_boundaries = apply_boundary_targets(
            signal,
            next_boundaries,
            calibration,
            {1: 0.60, 2: 0.64, 3: 0.72},
        )
        adjustments.append("Guardarrail SEBIA agarosa: correccion Albumina/Alfa 1.")
        percentages, separator_percentages = read_metrics(next_boundaries)
        albumina, alfa_1, _, beta_1, _, gamma = percentages
        sep_1, _, _, sep_4, sep_5 = separator_percentages

    if beta_1 >= 12.0 and gamma <= 3.0 and (sep_4 >= 74.0 or sep_5 >= 80.0):
        next_boundaries = apply_boundary_targets(
            signal,
            next_boundaries,
            calibration,
            {4: 0.72, 5: 0.755},
        )
        adjustments.append("Guardarrail SEBIA agarosa: correccion puente Beta/Gamma.")
        percentages, separator_percentages = read_metrics(next_boundaries)
        albumina, alfa_1, _, beta_1, _, gamma = percentages
        sep_1, _, _, sep_4, sep_5 = separator_percentages

    if gamma <= 3.0 and sep_5 >= 84.0:
        next_boundaries = apply_boundary_targets(
            signal,
            next_boundaries,
            calibration,
            {5: 0.795},
        )
        adjustments.append("Guardarrail SEBIA agarosa: correccion Beta 2/Gamma.")

    return normalize_boundary_indices(next_boundaries, signal.size), adjustments


def apply_sebia_capillary_guardrails(
    signal: np.ndarray,
    boundaries: list[int],
    calibration: ProcessorCalibration,
) -> tuple[list[int], list[str]]:
    max_index = max(signal.size - 1, 1)
    next_boundaries = normalize_boundary_indices(list(boundaries), signal.size)
    adjustments: list[str] = []

    def read_metrics(current_boundaries: list[int]) -> tuple[list[float], list[float]]:
        percentages = build_area_percentages(signal, current_boundaries)
        separator_percentages = [
            (current_boundaries[index] / max_index) * 100.0
            for index in range(1, len(current_boundaries) - 1)
        ]
        return percentages, separator_percentages

    percentages, separator_percentages = read_metrics(next_boundaries)
    albumina, alfa_1, alfa_2, beta_1, beta_2, gamma = percentages
    sep_1, sep_2, sep_3, sep_4, sep_5 = separator_percentages

    if albumina <= 54.0 and alfa_1 >= 6.5 and sep_1 <= 52.5:
        next_boundaries = apply_boundary_targets(
            signal,
            next_boundaries,
            calibration,
            {1: 0.536, 2: 0.551},
        )
        adjustments.append("Guardarrail SEBIA capilar: correccion Albumina/Alfa.")
        percentages, separator_percentages = read_metrics(next_boundaries)
        albumina, alfa_1, alfa_2, beta_1, beta_2, gamma = percentages
        sep_1, sep_2, sep_3, sep_4, sep_5 = separator_percentages

    if beta_1 >= 9.0 and beta_2 <= 4.5 and sep_4 >= 82.0:
        next_boundaries = apply_boundary_targets(
            signal,
            next_boundaries,
            calibration,
            {3: 0.707, 4: 0.760, 5: 0.878},
        )
        adjustments.append("Guardarrail SEBIA capilar: correccion zona Alfa 2/Beta/Gamma.")
        percentages, separator_percentages = read_metrics(next_boundaries)
        albumina, alfa_1, alfa_2, beta_1, beta_2, gamma = percentages
        sep_1, sep_2, sep_3, sep_4, sep_5 = separator_percentages

    if gamma <= 9.0 and sep_5 >= 90.0:
        next_boundaries = apply_boundary_targets(
            signal,
            next_boundaries,
            calibration,
            {5: 0.878},
        )
        adjustments.append("Guardarrail SEBIA capilar: correccion borde Gamma.")

    return normalize_boundary_indices(next_boundaries, signal.size), adjustments


def apply_equipment_guardrails(
    signal: np.ndarray,
    boundaries: list[int],
    calibration: ProcessorCalibration,
    equipment_profile: EquipmentProfileResolution,
) -> tuple[list[int], list[str]]:
    if equipment_profile.key == SEBIA_AGAROSE_IMAGE_PROFILE_KEY:
        return apply_sebia_agarose_guardrails(signal, boundaries, calibration)
    if equipment_profile.key == SEBIA_CAPILLARY_IMAGE_PROFILE_KEY:
        return apply_sebia_capillary_guardrails(signal, boundaries, calibration)
    return normalize_boundary_indices(boundaries, signal.size), []


def build_warnings(
    *,
    crop: CropPayload,
    calibration: ProcessorCalibration,
    detected_peaks: np.ndarray,
    signal: np.ndarray,
    boundaries: list[int],
    axis: str,
    equipment_profile: EquipmentProfileResolution,
    equipment_adjustments: list[str],
) -> list[str]:
    warnings: list[str] = []
    warnings.append("Motor v3.9 calibrado: resultado automatico preliminar; validar con revision manual o PDF antes de informar.")

    if equipment_profile.key == SEBIA_AGAROSE_IMAGE_PROFILE_KEY:
        warnings.append(f"Perfil de equipo activo: {equipment_profile.label}.")
    if equipment_profile.key == SEBIA_CAPILLARY_IMAGE_PROFILE_KEY:
        warnings.append("Equipo SEBIA capilar: el procesamiento por imagen es preliminar; ideal usar curva exportada por el equipo.")
    if equipment_adjustments:
        warnings.append(" ".join(equipment_adjustments))

    if crop.width < calibration.crop_warning_min_width or crop.height < calibration.crop_warning_min_height:
        warnings.append("El recorte es pequeno y puede degradar la estimacion.")
    expected_axis = "x" if crop.width >= crop.height else "y"
    if axis != expected_axis:
        warnings.append(f"El motor selecciono automaticamente el eje {axis.upper()} por calidad de perfil.")
    if detected_peaks.size < calibration.expected_peak_warning_threshold:
        warnings.append("Se detectaron pocos picos; revisar imagen y parametros.")

    internal_boundaries = boundaries[1:-1]
    non_minimum_boundaries = [boundary for boundary in internal_boundaries if not is_local_minimum(signal, boundary)]
    if non_minimum_boundaries:
        warnings.append("Uno o mas separadores automaticos no coinciden con un minimo local real; revisar posiciones manualmente.")

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
    equipment_origin: str | None = None,
    equipment_model: str | None = None,
    calibration: ProcessorCalibration | None = None,
) -> ProcessAnalysisResponse:
    active_calibration = calibration or get_calibration()
    equipment_profile = resolve_equipment_profile(equipment_origin, equipment_model)
    image = decode_image(contents)
    height, width = image.shape[:2]
    crop = build_crop_rect(crop_left, crop_top, crop_width, crop_height, width, height)

    gray = prepare_grayscale(image, active_calibration)
    cropped = gray[crop.top : crop.top + crop.height, crop.left : crop.left + crop.width]
    axis, signal, detected_peaks, boundaries = select_projection_axis(cropped, active_calibration)
    boundaries, equipment_adjustments = apply_equipment_guardrails(
        signal,
        boundaries,
        active_calibration,
        equipment_profile,
    )
    fractions = build_fractions(signal, boundaries, total_concentration)
    peaks = [fractions[key].peak_index for key in FRACTION_KEYS]
    detected_valleys = detect_valleys(signal, active_calibration)
    total_area = trapz_area(signal, boundaries[0], boundaries[-1])
    warnings = build_warnings(
        crop=crop,
        calibration=active_calibration,
        detected_peaks=detected_peaks,
        signal=signal,
        boundaries=boundaries,
        axis=axis,
        equipment_profile=equipment_profile,
        equipment_adjustments=equipment_adjustments,
    )

    return ProcessAnalysisResponse(
        algorithm_version=ALGORITHM_VERSION,
        calibration_profile=active_calibration.profile_name,
        calibration_version=active_calibration.profile_version,
        equipment_profile=equipment_profile.key,
        equipment_profile_label=equipment_profile.label,
        equipment_adjustments=equipment_adjustments,
        axis=axis,
        image_size=SizePayload(width=width, height=height),
        crop_used=crop,
        profile_length=int(signal.size),
        detected_peaks=int(detected_peaks.size),
        peaks=peaks,
        boundaries=boundaries,
        detected_valleys=detected_valleys,
        valleys=detected_valleys,
        total_area=round(total_area, 4),
        profile_signal=[round(float(value), 6) for value in signal],
        profile=downsample(signal, active_calibration.profile_downsample_points),
        fractions=fractions,
        warning=" ".join(warnings) if warnings else None,
    )
