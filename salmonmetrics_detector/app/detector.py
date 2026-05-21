from __future__ import annotations

import math
import os
import time
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np

from .models import Box, DetectResponse, WeaponCandidate, WeaponSlot
from .weapon_catalog import WeaponTemplateInfo, load_weapon_catalog


SERVICE_VERSION = "0.1.0"
ASSETS_DIR = Path(__file__).resolve().parents[1] / "assets" / "weapons"

MAX_IMAGE_DIM = int(os.getenv("MAX_IMAGE_DIM", "1200"))
MATCH_MIN_SCORE = float(os.getenv("MATCH_MIN_SCORE", "0.50"))
ACCEPT_AVG_SCORE = float(os.getenv("ACCEPT_AVG_SCORE", "0.985"))
ACCEPT_MIN_SCORE = float(os.getenv("ACCEPT_MIN_SCORE", "0.975"))
RANDOM_GREEN_MIN_GROUP = int(os.getenv("RANDOM_GREEN_MIN_GROUP", "4"))
DETECT_TIME_BUDGET_SECONDS = float(os.getenv("DETECT_TIME_BUDGET_SECONDS", "18"))


@dataclass
class PreparedTemplate:
    info: WeaponTemplateInfo
    gray: np.ndarray
    mask: np.ndarray | None


@dataclass
class MatchCandidate:
    template: PreparedTemplate
    score: float
    x: int
    y: int
    w: int
    h: int
    region_name: str
    region_offset: tuple[int, int]

    @property
    def center(self) -> tuple[float, float]:
        return (self.x + self.w / 2, self.y + self.h / 2)


class WeaponDetector:
    def __init__(self, assets_dir: Path = ASSETS_DIR) -> None:
        self.assets_dir = assets_dir
        self.templates = self._load_templates()

    def template_count(self) -> int:
        return len(self.templates)

    def detect(self, image_bytes: bytes) -> DetectResponse:
        started_at = time.monotonic()
        image = self._decode_image(image_bytes)
        if image is None:
            return DetectResponse(
                ok=False,
                mode="uncertain",
                confidence=0,
                needs_review=True,
                message="画像を読み込めませんでした",
            )

        image, resize_ratio = self._normalize_image(image)
        regions = self._candidate_regions(image)
        if not regions:
            return DetectResponse(
                ok=True,
                mode="not_visible",
                confidence=0,
                needs_review=True,
                message="ブキ欄が見つかりません",
                debug={"templates": self.template_count(), "resize_ratio": resize_ratio},
            )

        random_region = self._find_random_region(regions)
        if random_region is not None:
            weapons = [
                WeaponSlot(
                    slot=index,
                    weapon_id="random",
                    weapon_name_ja="ランダム",
                    weapon_name_en="Random",
                    confidence=1,
                    method="green_question_mark_detection",
                )
                for index in range(1, 5)
            ]
            return DetectResponse(
                ok=True,
                mode="random_weapons",
                confidence=1,
                weapons=weapons,
                needs_review=False,
                message="ランダムブキ欄を検出しました",
                debug={"region": random_region[0], "templates": self.template_count()},
            )

        candidate_groups: list[tuple[str, list[MatchCandidate]]] = []
        for region_name, region, offset in regions:
            if time.monotonic() - started_at > DETECT_TIME_BUDGET_SECONDS:
                break
            focused = self._focus_weapon_region(region_name, region, offset)
            if focused is None:
                continue
            focused_region_name, focused_region, focused_offset = focused
            matches = self._match_region(focused_region_name, focused_region, focused_offset)
            grouped = self._select_row(matches)
            if grouped:
                candidate_groups.append((focused_region_name, grouped))

        if not candidate_groups:
            return DetectResponse(
                ok=True,
                mode="not_visible",
                confidence=0,
                needs_review=True,
                message="ブキ欄が見つかりません",
                debug={"regions": [name for name, _, _ in regions], "templates": self.template_count()},
            )

        region_name, best_group = max(candidate_groups, key=lambda item: self._group_score(item[1]))
        weapons = self._to_slots(best_group)
        scores = [weapon.confidence for weapon in weapons]
        confidence = float(sum(scores) / max(1, len(scores))) * min(1.0, len(weapons) / 4)
        accepted = len(weapons) == 4 and confidence >= ACCEPT_AVG_SCORE and min(scores) >= ACCEPT_MIN_SCORE
        response_weapons = weapons if accepted else []

        return DetectResponse(
            ok=True,
            mode="fixed_weapons" if accepted else "uncertain",
            confidence=round(confidence, 4),
            weapons=response_weapons,
            needs_review=not accepted,
            message=None if accepted else "ブキ候補を確認してください",
            debug={
                "region": region_name,
                "regions": [name for name, _, _ in regions],
                "templates": self.template_count(),
                "resize_ratio": resize_ratio,
                "elapsed_seconds": round(time.monotonic() - started_at, 4),
                "thresholds": {
                    "accept_avg": ACCEPT_AVG_SCORE,
                    "accept_min": ACCEPT_MIN_SCORE,
                    "match_min": MATCH_MIN_SCORE,
                },
            },
        )

    def _load_templates(self) -> list[PreparedTemplate]:
        templates: list[PreparedTemplate] = []
        for info in load_weapon_catalog(self.assets_dir):
            raw = cv2.imread(str(info.path), cv2.IMREAD_UNCHANGED)
            if raw is None:
                continue

            if raw.ndim == 3 and raw.shape[2] == 4:
                bgr = raw[:, :, :3]
                alpha = raw[:, :, 3]
                mask = np.where(alpha > 12, 255, 0).astype(np.uint8)
            else:
                bgr = raw[:, :, :3] if raw.ndim == 3 else cv2.cvtColor(raw, cv2.COLOR_GRAY2BGR)
                gray_for_mask = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
                mask = np.where(gray_for_mask > 8, 255, 0).astype(np.uint8)

            cropped_bgr, cropped_mask = self._crop_to_mask(bgr, mask)
            if cropped_bgr is None:
                continue
            gray = cv2.cvtColor(cropped_bgr, cv2.COLOR_BGR2GRAY)
            templates.append(PreparedTemplate(info=info, gray=gray, mask=cropped_mask))
        return templates

    @staticmethod
    def _decode_image(image_bytes: bytes) -> np.ndarray | None:
        array = np.frombuffer(image_bytes, dtype=np.uint8)
        image = cv2.imdecode(array, cv2.IMREAD_COLOR)
        return image

    @staticmethod
    def _normalize_image(image: np.ndarray) -> tuple[np.ndarray, float]:
        height, width = image.shape[:2]
        longest = max(width, height)
        if longest <= MAX_IMAGE_DIM:
            return image, 1.0
        ratio = MAX_IMAGE_DIM / longest
        resized = cv2.resize(image, (int(width * ratio), int(height * ratio)), interpolation=cv2.INTER_AREA)
        return resized, ratio

    @staticmethod
    def _crop_to_mask(bgr: np.ndarray, mask: np.ndarray) -> tuple[np.ndarray | None, np.ndarray | None]:
        points = cv2.findNonZero(mask)
        if points is None:
            return None, None
        x, y, w, h = cv2.boundingRect(points)
        pad = 2
        y0 = max(0, y - pad)
        x0 = max(0, x - pad)
        y1 = min(bgr.shape[0], y + h + pad)
        x1 = min(bgr.shape[1], x + w + pad)
        return bgr[y0:y1, x0:x1], mask[y0:y1, x0:x1]

    def _candidate_regions(self, image: np.ndarray) -> list[tuple[str, np.ndarray, tuple[int, int]]]:
        height, width = image.shape[:2]
        regions: list[tuple[str, np.ndarray, tuple[int, int]]] = []

        hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
        green_mask = cv2.inRange(hsv, np.array([42, 70, 80]), np.array([92, 255, 255]))
        green_mask = cv2.morphologyEx(green_mask, cv2.MORPH_CLOSE, np.ones((9, 21), dtype=np.uint8))
        contours, _ = cv2.findContours(green_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        anchor_boxes: list[tuple[int, int, int, int, int]] = []
        for contour in contours:
            x, y, w, h = cv2.boundingRect(contour)
            area = w * h
            if area < max(120, width * height * 0.00015):
                continue
            if y > height * 0.72:
                continue
            anchor_boxes.append((area, x, y, w, h))

        clear_like_boxes = [
            box
            for box in anchor_boxes
            if box[2] < height * 0.36 and box[3] / max(1, box[4]) >= 2.2 and box[0] >= max(800, width * height * 0.001)
        ]
        if not clear_like_boxes:
            clear_like_boxes = [box for box in anchor_boxes if box[2] < height * 0.42]

        anchor_regions: list[tuple[str, np.ndarray, tuple[int, int]]] = []
        for index, (_, x, y, w, h) in enumerate(sorted(clear_like_boxes, reverse=True)[:1]):
            cx = x + w / 2
            left = int(max(0, cx - width * 0.30))
            right = int(min(width, cx + width * 0.30))
            top = int(max(0, y + h * 0.55))
            bottom = int(min(height, y + h + height * 0.105))
            if right - left >= 120 and bottom - top >= 45:
                anchor_regions.append((f"green_anchor_{index + 1}", image[top:bottom, left:right], (left, top)))

        if anchor_regions:
            return anchor_regions

        fallback_regions = [
            ("upper_center", (0.12, 0.10, 0.76, 0.25)),
            ("upper_wide", (0.06, 0.08, 0.88, 0.30)),
        ]
        for name, (fx, fy, fw, fh) in fallback_regions:
            left = int(width * fx)
            top = int(height * fy)
            right = int(width * (fx + fw))
            bottom = int(height * (fy + fh))
            regions.append((name, image[top:bottom, left:right], (left, top)))

        deduped: list[tuple[str, np.ndarray, tuple[int, int]]] = []
        seen: set[tuple[int, int, int, int]] = set()
        for name, region, (x, y) in regions:
            key = (x, y, region.shape[1], region.shape[0])
            if key in seen:
                continue
            seen.add(key)
            deduped.append((name, region, (x, y)))
        return deduped

    def _focus_weapon_region(
        self, region_name: str, region: np.ndarray, offset: tuple[int, int]
    ) -> tuple[str, np.ndarray, tuple[int, int]] | None:
        """Trim anchor crops to the dark top weapon pill.

        The green Clear!! anchor gets us close, but the resulting crop can still
        include score panels and player text. Matching only inside the dark pill
        keeps the detector fast and avoids confident matches on tiny text noise.
        """
        if not region_name.startswith("green_anchor_"):
            return region_name, region, offset

        region_h, region_w = region.shape[:2]
        if region_h < 35 or region_w < 120:
            return None

        gray = cv2.cvtColor(region, cv2.COLOR_BGR2GRAY)
        dark_mask = cv2.inRange(gray, 0, 58)
        dark_mask = cv2.morphologyEx(dark_mask, cv2.MORPH_CLOSE, np.ones((5, 21), dtype=np.uint8))
        contours, _ = cv2.findContours(dark_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        boxes: list[tuple[int, int, int, int, int]] = []
        for contour in contours:
            x, y, w, h = cv2.boundingRect(contour)
            area = w * h
            if area < max(900, int(region_w * region_h * 0.035)):
                continue
            if y > region_h * 0.56:
                continue
            if w < region_w * 0.35:
                continue
            if h < 18 or h > min(86, region_h * 0.72):
                continue
            if w / max(1, h) < 3.0:
                continue
            boxes.append((area, x, y, w, h))

        if boxes:
            _, x, y, w, h = sorted(boxes, key=lambda item: (item[2], -item[0]))[0]
            pad_x = max(2, int(w * 0.025))
            pad_y = max(2, int(h * 0.12))
            x0 = max(0, x - pad_x)
            y0 = max(0, y - pad_y)
            # The right side of the pill is the キケン度 label. Keep the left
            # side where the four shift weapons live.
            x1 = min(region_w, x + int(w * 0.66))
            y1 = min(region_h, y + h + pad_y)
        else:
            # Safe fallback: keep only the upper band under Clear!!, avoiding
            # both the Clear!! letters above and the score panels below. The
            # anchor crop is already relative to Clear!!, so this stays stable
            # across phone sizes better than absolute page coordinates.
            x0 = 0
            y0 = int(region_h * 0.24)
            x1 = int(region_w * 0.68)
            y1 = int(region_h * 0.60)

        focused = region[y0:y1, x0:x1]
        if focused.shape[0] < 25 or focused.shape[1] < 90:
            return None
        return f"{region_name}_weapon_pill", focused, (offset[0] + x0, offset[1] + y0)

    def _find_random_region(self, regions: list[tuple[str, np.ndarray, tuple[int, int]]]) -> tuple[str, list[tuple[int, int]]] | None:
        for name, region, _ in regions:
            if not name.startswith("green_anchor_"):
                continue
            hsv = cv2.cvtColor(region, cv2.COLOR_BGR2HSV)
            mask = cv2.inRange(hsv, np.array([44, 110, 120]), np.array([88, 255, 255]))
            mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((3, 3), dtype=np.uint8))
            contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            centers: list[tuple[int, int]] = []
            for contour in contours:
                x, y, w, h = cv2.boundingRect(contour)
                area = w * h
                if area < 25 or area > region.shape[0] * region.shape[1] * 0.08:
                    continue
                cy = y + h // 2
                # The "Clear!!" lettering is also bright green. Random weapon
                # question marks sit in the weapon pill below that title, so
                # ignore the top third of anchor crops to avoid false positives.
                if cy < region.shape[0] * 0.34:
                    continue
                ratio = w / max(1, h)
                if 0.15 <= ratio <= 1.8:
                    centers.append((x + w // 2, cy))
            if self._has_horizontal_group(centers, RANDOM_GREEN_MIN_GROUP):
                return name, centers
        return None

    @staticmethod
    def _has_horizontal_group(centers: list[tuple[int, int]], min_count: int) -> bool:
        if len(centers) < min_count:
            return False
        for _, y in centers:
            group = [(cx, cy) for cx, cy in centers if abs(cy - y) <= 18]
            if len(group) >= min_count:
                xs = sorted(cx for cx, _ in group)
                if xs[-1] - xs[0] >= 60:
                    return True
        return False

    def _match_region(self, region_name: str, region: np.ndarray, offset: tuple[int, int]) -> list[MatchCandidate]:
        if not self.templates:
            return []

        region_gray = cv2.cvtColor(region, cv2.COLOR_BGR2GRAY)
        region_h, region_w = region_gray.shape[:2]
        candidates: list[MatchCandidate] = []
        if "weapon_pill" in region_name:
            base_target = max(22, min(46, int(region_h * 0.50)))
            multipliers = (0.76, 0.9, 1.04, 1.18, 1.34)
        else:
            base_target = max(16, min(72, int(region_h * 0.18)))
            multipliers = (0.66, 0.82, 0.98, 1.14, 1.32)

        for template in self.templates:
            th, tw = template.gray.shape[:2]
            if th < 4 or tw < 4:
                continue

            base_scale = base_target / max(th, tw)
            for multiplier in multipliers:
                scale = base_scale * multiplier
                scaled_w = max(8, int(tw * scale))
                scaled_h = max(8, int(th * scale))
                if scaled_w >= region_w or scaled_h >= region_h:
                    continue
                if scaled_w > 120 or scaled_h > 120:
                    continue

                resized = cv2.resize(template.gray, (scaled_w, scaled_h), interpolation=cv2.INTER_AREA)
                mask = None
                if template.mask is not None:
                    mask = cv2.resize(template.mask, (scaled_w, scaled_h), interpolation=cv2.INTER_NEAREST)
                    if cv2.countNonZero(mask) < 12:
                        mask = None

                try:
                    result = cv2.matchTemplate(region_gray, resized, cv2.TM_CCORR_NORMED, mask=mask)
                except cv2.error:
                    result = cv2.matchTemplate(region_gray, resized, cv2.TM_CCOEFF_NORMED)

                _, max_value, _, max_loc = cv2.minMaxLoc(result)
                score = float(max_value)
                if math.isnan(score) or score < MATCH_MIN_SCORE:
                    continue

                candidates.append(
                    MatchCandidate(
                        template=template,
                        score=score,
                        x=max_loc[0] + offset[0],
                        y=max_loc[1] + offset[1],
                        w=scaled_w,
                        h=scaled_h,
                        region_name=region_name,
                        region_offset=offset,
                    )
                )

        return self._nms(candidates)

    def _select_row(self, candidates: list[MatchCandidate]) -> list[MatchCandidate]:
        if not candidates:
            return []
        candidates = [candidate for candidate in candidates if self._is_plausible_icon_candidate(candidate)]
        if not candidates:
            return []

        groups: list[list[MatchCandidate]] = []
        for candidate in sorted(candidates, key=lambda item: item.center[1]):
            placed = False
            for group in groups:
                median_y = float(np.median([item.center[1] for item in group]))
                median_h = float(np.median([item.h for item in group]))
                if abs(candidate.center[1] - median_y) <= max(16, median_h * 0.75):
                    group.append(candidate)
                    placed = True
                    break
            if not placed:
                groups.append([candidate])

        usable_groups = [group for group in groups if len(group) >= 3]
        if not usable_groups:
            return []

        best_group = max(usable_groups, key=self._group_score)
        best_group = sorted(best_group, key=lambda item: item.score, reverse=True)
        best_group = self._nms(best_group, iou_threshold=0.18)
        best_group = sorted(best_group[:4], key=lambda item: item.center[0])
        return best_group

    @staticmethod
    def _is_plausible_icon_candidate(candidate: MatchCandidate) -> bool:
        if "weapon_pill" not in candidate.region_name:
            return True
        area = candidate.w * candidate.h
        if area < 210:
            return False
        if max(candidate.w, candidate.h) < 18:
            return False
        if min(candidate.w, candidate.h) < 8:
            return False
        aspect = candidate.w / max(1, candidate.h)
        return 0.28 <= aspect <= 3.6

    @staticmethod
    def _group_score(group: list[MatchCandidate]) -> float:
        if not group:
            return 0
        scores = [item.score for item in group[:4]]
        count_bonus = min(4, len(group)) * 0.04
        span = max(item.center[0] for item in group) - min(item.center[0] for item in group)
        span_bonus = min(0.1, span / 1600)
        return float(sum(scores) / len(scores) + count_bonus + span_bonus)

    @staticmethod
    def _nms(candidates: list[MatchCandidate], iou_threshold: float = 0.28) -> list[MatchCandidate]:
        selected: list[MatchCandidate] = []
        for candidate in sorted(candidates, key=lambda item: item.score, reverse=True):
            if any(_iou(candidate, kept) > iou_threshold for kept in selected):
                continue
            if any(_center_distance(candidate, kept) < max(candidate.w, candidate.h, kept.w, kept.h) * 0.55 for kept in selected):
                continue
            selected.append(candidate)
            if len(selected) >= 28:
                break
        return selected

    def _to_slots(self, matches: list[MatchCandidate]) -> list[WeaponSlot]:
        slots: list[WeaponSlot] = []
        for index, match in enumerate(matches[:4], start=1):
            similar = self._similar_candidates(match)
            slots.append(
                WeaponSlot(
                    slot=index,
                    weapon_id=match.template.info.weapon_id,
                    weapon_name_ja=match.template.info.name_ja,
                    weapon_name_en=match.template.info.name_en,
                    confidence=round(max(0, min(1, match.score)), 4),
                    method="opencv_template_match",
                    box=Box(x=match.x, y=match.y, w=match.w, h=match.h),
                    candidates=similar,
                )
            )
        return slots

    def _similar_candidates(self, match: MatchCandidate) -> list[WeaponCandidate]:
        # The first phase returns the accepted candidate. A later Cloud Run revision
        # can keep more per-slot contenders for Gemini tie-breaking.
        return [
            WeaponCandidate(
                weapon_id=match.template.info.weapon_id,
                weapon_name_ja=match.template.info.name_ja,
                weapon_name_en=match.template.info.name_en,
                confidence=round(max(0, min(1, match.score)), 4),
            )
        ]


def _iou(a: MatchCandidate, b: MatchCandidate) -> float:
    ax1, ay1, ax2, ay2 = a.x, a.y, a.x + a.w, a.y + a.h
    bx1, by1, bx2, by2 = b.x, b.y, b.x + b.w, b.y + b.h
    ix1, iy1 = max(ax1, bx1), max(ay1, by1)
    ix2, iy2 = min(ax2, bx2), min(ay2, by2)
    iw, ih = max(0, ix2 - ix1), max(0, iy2 - iy1)
    intersection = iw * ih
    union = a.w * a.h + b.w * b.h - intersection
    return intersection / union if union else 0


def _center_distance(a: MatchCandidate, b: MatchCandidate) -> float:
    ax, ay = a.center
    bx, by = b.center
    return math.hypot(ax - bx, ay - by)
