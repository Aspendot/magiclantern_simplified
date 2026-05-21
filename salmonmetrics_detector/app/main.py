from __future__ import annotations

import os

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from .detector import SERVICE_VERSION, WeaponDetector
from .models import DetectResponse, HealthResponse


MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_BYTES", str(8 * 1024 * 1024)))
CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", "https://salmonmetrics.pages.dev,http://localhost:8788,http://localhost:5173").split(",")
    if origin.strip()
]

app = FastAPI(title="SalmonMetrics OpenCV Detector", version=SERVICE_VERSION)
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS if CORS_ORIGINS != ["*"] else ["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

detector = WeaponDetector()


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(
        ok=True,
        service="salmonmetrics-detector",
        version=SERVICE_VERSION,
        templates_loaded=detector.template_count(),
    )


@app.post("/detect", response_model=DetectResponse)
async def detect(file: UploadFile = File(...)) -> DetectResponse:
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="file must be an image")

    image_bytes = await file.read()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="file is empty")
    if len(image_bytes) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail=f"file is too large; max is {MAX_UPLOAD_BYTES} bytes")

    return detector.detect(image_bytes)

