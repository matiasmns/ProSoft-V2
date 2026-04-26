from __future__ import annotations

import os

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from .calibration import get_calibration
from .processor import ALGORITHM_VERSION, process_electrophoresis_image
from .schemas import CalibrationResponse, HealthResponse, ProcessAnalysisResponse


def build_allowed_origins() -> list[str]:
    raw_value = os.getenv("ALLOWED_ORIGINS", "")
    configured = [origin.strip() for origin in raw_value.split(",") if origin.strip()]
    if configured:
        return configured

    return [
        "http://127.0.0.1:5173",
        "http://localhost:5173",
        "http://127.0.0.1:4173",
        "http://localhost:4173",
    ]


app = FastAPI(
    title="ProSoft Analysis API",
    version="0.1.0",
    description="API interna para procesamiento de electroforesis de proteinas.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=build_allowed_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", response_model=HealthResponse)
async def healthcheck() -> HealthResponse:
    return HealthResponse(status="ok", service="prosoft-analysis-api")


@app.get("/api/v1/calibration", response_model=CalibrationResponse)
async def calibration_profile() -> CalibrationResponse:
    calibration = get_calibration()
    return calibration.to_response(algorithm_version=ALGORITHM_VERSION)


@app.post("/api/v1/analysis/process", response_model=ProcessAnalysisResponse)
async def process_analysis(
    file: UploadFile = File(...),
    crop_left: int | None = Form(default=None),
    crop_top: int | None = Form(default=None),
    crop_width: int | None = Form(default=None),
    crop_height: int | None = Form(default=None),
    total_concentration: float | None = Form(default=None),
) -> ProcessAnalysisResponse:
    contents = await file.read()
    calibration = get_calibration()

    if not contents:
        raise HTTPException(status_code=400, detail="El archivo recibido esta vacio.")

    try:
        return process_electrophoresis_image(
            contents,
            crop_left=crop_left,
            crop_top=crop_top,
            crop_width=crop_width,
            crop_height=crop_height,
            total_concentration=total_concentration,
            calibration=calibration,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # pragma: no cover
        raise HTTPException(status_code=500, detail=f"Fallo interno del procesador: {exc}") from exc
