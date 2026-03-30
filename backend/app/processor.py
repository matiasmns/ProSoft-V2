from __future__ import annotations

import cv2
import numpy as np
from scipy.ndimage import gaussian_filter1d, minimum_filter1d
from scipy.signal import find_peaks

from .calibration import FractionWindowConfig, ProcessorCalibration, get_calibration
from .schemas import CropPayload, FractionKey, FractionResult, ProcessAnalysisResponse, ProfilePoint, SizePayload


ALGORITHM_VERSION = "fastapi-opencv-v2"


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
    return corrected / peak


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
        segment = signal[current : following + 1]
        valley = current + int(np.argmin(segment))
        valleys.append(valley)
    return valleys


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
    valleys = find_valleys(signal, peaks)
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
