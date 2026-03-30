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
    clahe_clip_limit: float
    clahe_tile_grid_size: int
    gaussian_blur_kernel_size: int
    smoothing_sigma_divisor: float
    smoothing_sigma_min: float
    baseline_window_divisor: int
    baseline_window_min: int
    peak_prominence: float
    peak_distance_divisor: int
    peak_distance_min: int
    expected_peak_warning_threshold: int
    crop_warning_min_width: int
    crop_warning_min_height: int
    profile_downsample_points: int
    fraction_windows: list[FractionWindowPayload]
