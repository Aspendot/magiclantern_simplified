from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


DetectionMode = Literal["fixed_weapons", "random_weapons", "not_visible", "uncertain"]


class Box(BaseModel):
    x: int
    y: int
    w: int
    h: int


class WeaponCandidate(BaseModel):
    weapon_id: str
    weapon_name_ja: str | None = None
    weapon_name_en: str | None = None
    confidence: float = Field(ge=0, le=1)


class WeaponSlot(BaseModel):
    slot: int = Field(ge=1, le=4)
    weapon_id: str
    weapon_name_ja: str | None = None
    weapon_name_en: str | None = None
    confidence: float = Field(ge=0, le=1)
    method: str
    box: Box | None = None
    candidates: list[WeaponCandidate] = Field(default_factory=list)


class DetectResponse(BaseModel):
    ok: bool
    mode: DetectionMode
    confidence: float = Field(ge=0, le=1)
    weapons: list[WeaponSlot] = Field(default_factory=list)
    needs_review: bool
    source: str = "opencv_template_match"
    message: str | None = None
    debug: dict = Field(default_factory=dict)


class HealthResponse(BaseModel):
    ok: bool
    service: str
    version: str
    templates_loaded: int

