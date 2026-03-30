from __future__ import annotations

import json
import os
from functools import lru_cache
from pathlib import Path

from pydantic import BaseModel, Field, model_validator

from .schemas import CalibrationResponse, FractionKey, FractionWindowPayload


DEFAULT_CALIBRATION_FILE = Path(__file__).with_name("default_calibration.json")
CALIBRATION_ENV_VAR = "PROSOFT_CALIBRATION_FILE"


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
    clahe_clip_limit: float = Field(gt=0.0)
    clahe_tile_grid_size: int = Field(ge=1)
    gaussian_blur_kernel_size: int = Field(ge=1)
    smoothing_sigma_divisor: float = Field(gt=0.0)
    smoothing_sigma_min: float = Field(gt=0.0)
    baseline_window_divisor: int = Field(ge=1)
    baseline_window_min: int = Field(ge=3)
    peak_prominence: float = Field(gt=0.0)
    peak_distance_divisor: int = Field(ge=1)
    peak_distance_min: int = Field(ge=1)
    expected_peak_warning_threshold: int = Field(ge=1)
    crop_warning_min_width: int = Field(ge=1)
    crop_warning_min_height: int = Field(ge=1)
    profile_downsample_points: int = Field(ge=16)
    fraction_windows: tuple[FractionWindowConfig, ...]

    @model_validator(mode="after")
    def validate_profile(self) -> "ProcessorCalibration":
        if self.gaussian_blur_kernel_size % 2 == 0:
            raise ValueError("gaussian_blur_kernel_size debe ser impar.")
        if self.baseline_window_min % 2 == 0:
            raise ValueError("baseline_window_min debe ser impar.")
        if not self.fraction_windows:
            raise ValueError("La calibracion debe definir fraction_windows.")

        keys = [window.key for window in self.fraction_windows]
        if len(set(keys)) != len(keys):
            raise ValueError("fraction_windows contiene claves repetidas.")

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
            clahe_clip_limit=self.clahe_clip_limit,
            clahe_tile_grid_size=self.clahe_tile_grid_size,
            gaussian_blur_kernel_size=self.gaussian_blur_kernel_size,
            smoothing_sigma_divisor=self.smoothing_sigma_divisor,
            smoothing_sigma_min=self.smoothing_sigma_min,
            baseline_window_divisor=self.baseline_window_divisor,
            baseline_window_min=self.baseline_window_min,
            peak_prominence=self.peak_prominence,
            peak_distance_divisor=self.peak_distance_divisor,
            peak_distance_min=self.peak_distance_min,
            expected_peak_warning_threshold=self.expected_peak_warning_threshold,
            crop_warning_min_width=self.crop_warning_min_width,
            crop_warning_min_height=self.crop_warning_min_height,
            profile_downsample_points=self.profile_downsample_points,
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


@lru_cache(maxsize=1)
def get_calibration() -> ProcessorCalibration:
    return load_calibration()


def reload_calibration() -> ProcessorCalibration:
    get_calibration.cache_clear()
    return get_calibration()
