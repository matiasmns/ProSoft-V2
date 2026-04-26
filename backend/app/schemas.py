from __future__ import annotations

from typing import Literal

from pydantic import BaseModel


FractionKey = Literal["albumina", "alfa_1", "alfa_2", "beta_1", "beta_2", "gamma"]


class SizePayload(BaseModel):
    width: int
    height: int


class CropPayload(BaseModel):
    left: int
    top: int
    width: int
    height: int


class ProfilePoint(BaseModel):
    x: float
    y: float


class FractionResult(BaseModel):
    start: int
    end: int
    peak_index: int
    area: float
    percentage: float
    concentration: float | None = None


class FractionWindowPayload(BaseModel):
    key: FractionKey
    start: float
    end: float


class ProcessAnalysisResponse(BaseModel):
    algorithm_version: str
    calibration_profile: str
    calibration_version: str
    axis: Literal["x", "y"]
    image_size: SizePayload
    crop_used: CropPayload
    profile_length: int
    detected_peaks: int
    peaks: list[int]
    valleys: list[int]
    total_area: float
    profile_signal: list[float]
    profile: list[ProfilePoint]
    fractions: dict[FractionKey, FractionResult]
    warning: str | None = None


class HealthResponse(BaseModel):
    status: Literal["ok"]
    service: str


class CalibrationResponse(BaseModel):
    algorithm_version: str
    profile_name: str
    profile_version: str
    description: str | None = None
    gaussian_blur_kernel_size: int
    projection_top_fraction: float
    smoothing_sigma_divisor: float
    smoothing_sigma_min: float
    signal_floor: float
    min_signal_dynamic_range: float
    global_baseline_percentile: float
    residual_baseline_percentile: float
    local_baseline_min_correlation: float
    local_baseline_max_peak_shift_ratio: float
    baseline_window_divisor: int
    baseline_window_min: int
    peak_prominence: float
    peak_distance_divisor: int
    peak_distance_min: int
    expected_peak_warning_threshold: int
    crop_warning_min_width: int
    crop_warning_min_height: int
    profile_downsample_points: int
    high_valley_warning_level: float
    albumin_target_position_in_window: float
    boundary_shift_limit_ratio: float
    gaussian_width_min_ratio: float
    gaussian_width_scales: list[float]
    gaussian_fit_iterations: int
    gaussian_fit_epsilon: float
    reference_valley_snap_window_ratio: float
    reference_max_fraction_error_after_snap: float
    reference_max_total_error_increase_after_snap: float
    fraction_windows: list[FractionWindowPayload]
