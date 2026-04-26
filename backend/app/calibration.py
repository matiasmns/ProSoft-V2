from __future__ import annotations

import json
import os
from pathlib import Path

from pydantic import BaseModel, Field, model_validator

from .schemas import CalibrationResponse, FractionKey, FractionWindowPayload


DEFAULT_CALIBRATION_FILE = Path(__file__).with_name("default_calibration.json")
CALIBRATION_ENV_VAR = "PROSOFT_CALIBRATION_FILE"
EXPECTED_FRACTION_KEYS: tuple[FractionKey, ...] = ("albumina", "alfa_1", "alfa_2", "beta_1", "beta_2", "gamma")


class FractionWindowConfig(BaseModel):
    key: FractionKey
    start: float = Field(ge=0.0, le=1.0)
    end: float = Field(ge=0.0, le=1.0)

    @model_validator(mode="after")
    def validate_range(self) -> "FractionWindowConfig":
        if self.end <= self.start:
            raise ValueError(f"La ventana de {self.key} debe tener end > start.")
        return self


class ProcessorCalibration(BaseModel):
    profile_name: str
    profile_version: str
    description: str | None = None
    gaussian_blur_kernel_size: int = Field(default=5, ge=1)
    projection_top_fraction: float = Field(default=0.38, gt=0.0, le=1.0)
    smoothing_sigma_divisor: float = Field(gt=0.0)
    smoothing_sigma_min: float = Field(gt=0.0)
    signal_floor: float = Field(default=0.0, ge=0.0, lt=1.0)
    min_signal_dynamic_range: float = Field(default=0.035, gt=0.0, lt=1.0)
    global_baseline_percentile: float = Field(default=0.05, ge=0.0, le=1.0)
    residual_baseline_percentile: float = Field(default=0.02, ge=0.0, le=1.0)
    local_baseline_min_correlation: float = Field(default=0.90, ge=0.0, le=1.0)
    local_baseline_max_peak_shift_ratio: float = Field(default=0.065, ge=0.0, le=1.0)
    baseline_window_divisor: int = Field(ge=1)
    baseline_window_min: int = Field(ge=3)
    peak_prominence: float = Field(gt=0.0)
    peak_distance_divisor: int = Field(ge=1)
    peak_distance_min: int = Field(ge=1)
    expected_peak_warning_threshold: int = Field(ge=1)
    crop_warning_min_width: int = Field(ge=1)
    crop_warning_min_height: int = Field(ge=1)
    profile_downsample_points: int = Field(ge=16)
    high_valley_warning_level: float = Field(default=0.34, ge=0.0, le=1.0)
    albumin_target_position_in_window: float = Field(default=0.60, ge=0.0, le=1.0)
    boundary_shift_limit_ratio: float = Field(default=0.08, ge=0.0, le=1.0)
    gaussian_width_min_ratio: float = Field(default=0.026, gt=0.0, lt=1.0)
    gaussian_width_scales: tuple[float, ...] = (0.7, 1.0, 1.35)
    gaussian_fit_iterations: int = Field(default=1200, ge=1)
    gaussian_fit_epsilon: float = Field(default=1e-9, gt=0.0)
    reference_valley_snap_window_ratio: float = Field(default=0.04, gt=0.0, le=1.0)
    reference_max_fraction_error_after_snap: float = Field(default=1.25, ge=0.0)
    reference_max_total_error_increase_after_snap: float = Field(default=1.5, ge=0.0)
    fraction_windows: tuple[FractionWindowConfig, ...]

    @model_validator(mode="after")
    def validate_profile(self) -> "ProcessorCalibration":
        if self.gaussian_blur_kernel_size % 2 == 0:
            raise ValueError("gaussian_blur_kernel_size debe ser impar.")
        if self.baseline_window_min % 2 == 0:
            raise ValueError("baseline_window_min debe ser impar.")
        if not self.fraction_windows:
            raise ValueError("La calibracion debe definir fraction_windows.")
        if not self.gaussian_width_scales:
            raise ValueError("gaussian_width_scales debe tener al menos una escala.")
        if any(scale <= 0.0 for scale in self.gaussian_width_scales):
            raise ValueError("Cada escala gaussiana debe ser positiva.")

        keys = [window.key for window in self.fraction_windows]
        if len(set(keys)) != len(keys):
            raise ValueError("fraction_windows contiene claves repetidas.")
        if tuple(keys) != EXPECTED_FRACTION_KEYS:
            raise ValueError("fraction_windows debe respetar el orden fijo: albumina, alfa_1, alfa_2, beta_1, beta_2, gamma.")

        first_window = self.fraction_windows[0]
        last_window = self.fraction_windows[-1]
        if abs(first_window.start - 0.0) > 1e-6:
            raise ValueError("La primera ventana debe comenzar en 0.0.")
        if abs(last_window.end - 1.0) > 1e-6:
            raise ValueError("La ultima ventana debe terminar en 1.0.")

        for previous, current in zip(self.fraction_windows, self.fraction_windows[1:]):
            if abs(previous.end - current.start) > 1e-6:
                raise ValueError("Las ventanas de fracciones deben ser contiguas.")

        return self

    def to_response(self, *, algorithm_version: str) -> CalibrationResponse:
        return CalibrationResponse(
            algorithm_version=algorithm_version,
            profile_name=self.profile_name,
            profile_version=self.profile_version,
            description=self.description,
            gaussian_blur_kernel_size=self.gaussian_blur_kernel_size,
            projection_top_fraction=self.projection_top_fraction,
            smoothing_sigma_divisor=self.smoothing_sigma_divisor,
            smoothing_sigma_min=self.smoothing_sigma_min,
            signal_floor=self.signal_floor,
            min_signal_dynamic_range=self.min_signal_dynamic_range,
            global_baseline_percentile=self.global_baseline_percentile,
            residual_baseline_percentile=self.residual_baseline_percentile,
            local_baseline_min_correlation=self.local_baseline_min_correlation,
            local_baseline_max_peak_shift_ratio=self.local_baseline_max_peak_shift_ratio,
            baseline_window_divisor=self.baseline_window_divisor,
            baseline_window_min=self.baseline_window_min,
            peak_prominence=self.peak_prominence,
            peak_distance_divisor=self.peak_distance_divisor,
            peak_distance_min=self.peak_distance_min,
            expected_peak_warning_threshold=self.expected_peak_warning_threshold,
            crop_warning_min_width=self.crop_warning_min_width,
            crop_warning_min_height=self.crop_warning_min_height,
            profile_downsample_points=self.profile_downsample_points,
            high_valley_warning_level=self.high_valley_warning_level,
            albumin_target_position_in_window=self.albumin_target_position_in_window,
            boundary_shift_limit_ratio=self.boundary_shift_limit_ratio,
            gaussian_width_min_ratio=self.gaussian_width_min_ratio,
            gaussian_width_scales=list(self.gaussian_width_scales),
            gaussian_fit_iterations=self.gaussian_fit_iterations,
            gaussian_fit_epsilon=self.gaussian_fit_epsilon,
            reference_valley_snap_window_ratio=self.reference_valley_snap_window_ratio,
            reference_max_fraction_error_after_snap=self.reference_max_fraction_error_after_snap,
            reference_max_total_error_increase_after_snap=self.reference_max_total_error_increase_after_snap,
            fraction_windows=[
                FractionWindowPayload(
                    key=window.key,
                    start=window.start,
                    end=window.end,
                )
                for window in self.fraction_windows
            ],
        )


def resolve_calibration_path() -> Path:
    configured_path = os.getenv(CALIBRATION_ENV_VAR)
    if configured_path:
        return Path(configured_path).expanduser().resolve()
    return DEFAULT_CALIBRATION_FILE.resolve()


def load_calibration(path: Path | None = None) -> ProcessorCalibration:
    calibration_path = path or resolve_calibration_path()
    payload = json.loads(calibration_path.read_text(encoding="utf-8"))
    return ProcessorCalibration.model_validate(payload)


_cached_calibration: ProcessorCalibration | None = None
_cached_cache_key: tuple[str, int] | None = None


def _build_cache_key(path: Path) -> tuple[str, int]:
    stat = path.stat()
    return (str(path), stat.st_mtime_ns)


def get_calibration() -> ProcessorCalibration:
    global _cached_calibration, _cached_cache_key

    calibration_path = resolve_calibration_path()
    cache_key = _build_cache_key(calibration_path)
    if _cached_calibration is None or _cached_cache_key != cache_key:
        _cached_calibration = load_calibration(calibration_path)
        _cached_cache_key = cache_key
    return _cached_calibration


def reload_calibration() -> ProcessorCalibration:
    global _cached_calibration, _cached_cache_key
    _cached_calibration = None
    _cached_cache_key = None
    return get_calibration()
