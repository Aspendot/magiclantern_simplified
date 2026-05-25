from __future__ import annotations

import math
import os
import time
from dataclasses import dataclass
from itertools import combinations
from pathlib import Path

import cv2
import numpy as np

from .models import Box, DetectResponse, WeaponCandidate, WeaponSlot
from .weapon_catalog import WeaponTemplateInfo, load_weapon_catalog


SERVICE_VERSION = "0.2.5"
ASSETS_ROOT = Path(__file__).resolve().parents[1] / "assets"
DEFAULT_TEMPLATE_DIR = ASSETS_ROOT / "weapon_templates"
FALLBACK_TEMPLATE_DIR = ASSETS_ROOT / "weapons"
ASSETS_DIR = Path(os.getenv("WEAPON_TEMPLATE_DIR", str(DEFAULT_TEMPLATE_DIR)))

MAX_IMAGE_DIM = int(os.getenv("MAX_IMAGE_DIM", "1800"))
MATCH_MIN_SCORE = float(os.getenv("MATCH_MIN_SCORE", "0.50"))
ACCEPT_AVG_SCORE = float(os.getenv("ACCEPT_AVG_SCORE", "0.980"))
ACCEPT_MIN_SCORE = float(os.getenv("ACCEPT_MIN_SCORE", "0.975"))
RANDOM_GREEN_MIN_GROUP = int(os.getenv("RANDOM_GREEN_MIN_GROUP", "4"))
DETECT_TIME_BUDGET_SECONDS = float(os.getenv("DETECT_TIME_BUDGET_SECONDS", "25"))


@dataclass
class PreparedTemplate:
    info: WeaponTemplateInfo
    bgr: np.ndarray
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
    method: str = "opencv_template_match"

    @property
    def center(self) -> tuple[float, float]:
        return (self.x + self.w / 2, self.y + self.h / 2)


class WeaponDetector:
    def __init__(self, assets_dir: Path = ASSETS_DIR) -> None:
        self.assets_dir = assets_dir
        self.templates = self._load_templates()
        if not self.templates and assets_dir != FALLBACK_TEMPLATE_DIR:
            self.assets_dir = FALLBACK_TEMPLATE_DIR
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
            if "weapon_pill" in focused_region_name:
                grouped = self._match_weapon_pill_slots(focused_region_name, focused_region, focused_offset)

                if not grouped:
                    grouped = self._match_weapon_pill_even_slots(focused_region_name, focused_region, focused_offset)

                if grouped:
                    candidate_groups.append((focused_region_name, grouped))

                # Keep loose matching only as a non-accepted debug fallback.
                matches = self._match_region(focused_region_name, focused_region, focused_offset)
                row_grouped = self._select_row(matches)
                if row_grouped:
                    candidate_groups.append((focused_region_name, row_grouped))
            else:
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

        region_name, best_group = self._best_candidate_group(candidate_groups)
        weapons = self._to_slots(best_group)
        scores = [weapon.confidence for weapon in weapons]
        confidence = float(sum(scores) / max(1, len(scores))) * min(1.0, len(weapons) / 4)
        accepted = self._is_accepted_group(best_group, confidence, scores)
        response_weapons = weapons if accepted else []

        return DetectResponse(
            ok=True,
            mode="fixed_weapons" if accepted else "uncertain",
            confidence=round(confidence, 4),
            weapons=response_weapons,
            needs_review=not accepted,
            source=best_group[0].method if best_group else "opencv_template_match",
            message=None if accepted else "ブキ候補を確認してください",
            debug={
                "region": region_name,
                "regions": [name for name, _, _ in regions],
                "templates": self.template_count(),
                "resize_ratio": resize_ratio,
                "elapsed_seconds": round(time.monotonic() - started_at, 4),
                "accepted": accepted,
                "candidate_weapon_ids": [weapon.weapon_id for weapon in weapons],
                "candidate_scores": [weapon.confidence for weapon in weapons],
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
            if cropped_mask is not None and cv2.countNonZero(cropped_mask) > 64:
                cropped_mask = cv2.erode(cropped_mask, np.ones((2, 2), dtype=np.uint8), iterations=1)
            gray = cv2.cvtColor(cropped_bgr, cv2.COLOR_BGR2GRAY)
            templates.append(PreparedTemplate(info=info, bgr=cropped_bgr, gray=gray, mask=cropped_mask))
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
        raw_dark_mask = cv2.inRange(gray, 0, 42)
        dark_mask = cv2.morphologyEx(raw_dark_mask, cv2.MORPH_CLOSE, np.ones((5, 21), dtype=np.uint8))
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
            row_counts = np.count_nonzero(raw_dark_mask[:, x : x + w], axis=1)
            covered_rows = np.flatnonzero(row_counts >= w * 0.42)
            covered_rows = covered_rows[(covered_rows >= y) & (covered_rows < y + h)]
            if len(covered_rows) >= 18:
                y = int(covered_rows[0])
                h = int(covered_rows[-1] - covered_rows[0] + 1)
            pad_x = max(2, int(w * 0.012))
            pad_y = max(2, int(h * 0.09))
            x0 = max(0, x + pad_x)
            y0 = max(0, y + pad_y)
            # The right side of the pill is the キケン度 label. Keep the left
            # side where the four shift weapons live.
            x1 = min(region_w, x + int(w * 0.56))
            y1 = min(region_h, y + h - pad_y)
        else:
            # Safe fallback: keep only the upper band under Clear!!, avoiding
            # both the Clear!! letters above and the score panels below. The
            # anchor crop is already relative to Clear!!, so this stays stable
            # across phone sizes better than absolute page coordinates.
            x0 = 0
            y0 = int(region_h * 0.24)
            x1 = int(region_w * 0.58)
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
            multipliers = (0.50, 0.60, 0.66, 0.76, 0.90, 1.04, 1.18, 1.34, 1.50)
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

                if "weapon_pill" in region_name:
                    score = self._color_adjusted_score(template, region, score, max_loc[0], max_loc[1], scaled_w, scaled_h)

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
                        method="opencv_color_template_match" if "weapon_pill" in region_name else "opencv_template_match",
                    )
                )

        if "weapon_pill" in region_name:
            candidates = [candidate for candidate in candidates if self._is_plausible_icon_candidate(candidate)]
        return self._nms(candidates)

    def _match_weapon_pill_slots(
        self, region_name: str, region: np.ndarray, offset: tuple[int, int]
    ) -> list[MatchCandidate]:
        if not self.templates:
            return []

        foreground = self._pill_foreground_mask(region)
        slot_geometry = self._slot_geometry_from_foreground(foreground)
        if slot_geometry is None:
            return []
        centers, bounds = slot_geometry

        region_gray = cv2.cvtColor(region, cv2.COLOR_BGR2GRAY)
        region_h, region_w = region_gray.shape[:2]
        base_target = max(22, min(46, int(region_h * 0.50)))
        multipliers = (0.76, 0.9, 1.04, 1.18, 1.34)
        minimum_local_foreground = max(42, int(region_h * region_w * 0.0075))
        slot_foreground_counts = [
            max(1, int(cv2.countNonZero(foreground[:, bounds[index] : bounds[index + 1]]))) for index in range(4)
        ]

        slot_candidates: list[list[tuple[float, MatchCandidate]]] = [[] for _ in range(4)]
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
                result = np.nan_to_num(result, nan=-1.0, posinf=-1.0, neginf=-1.0)

                for _ in range(3):
                    _, max_value, _, max_loc = cv2.minMaxLoc(result)
                    raw_score = float(max_value)
                    if raw_score < MATCH_MIN_SCORE:
                        break

                    local_x, local_y = max_loc
                    center_x = local_x + scaled_w / 2
                    center_y = local_y + scaled_h / 2
                    slot_index = min(range(4), key=lambda index: abs(center_x - centers[index]))
                    slot_width = max(1, bounds[slot_index + 1] - bounds[slot_index])
                    if center_x < bounds[slot_index] - scaled_w * 0.35:
                        self._suppress_match_location(result, local_x, local_y, scaled_w, scaled_h)
                        continue
                    if center_x > bounds[slot_index + 1] + scaled_w * 0.35:
                        self._suppress_match_location(result, local_x, local_y, scaled_w, scaled_h)
                        continue
                    if abs(center_x - centers[slot_index]) > max(slot_width * 0.65, scaled_w * 0.9):
                        self._suppress_match_location(result, local_x, local_y, scaled_w, scaled_h)
                        continue
                    if center_y < region_h * 0.04 or center_y > region_h * 0.92:
                        self._suppress_match_location(result, local_x, local_y, scaled_w, scaled_h)
                        continue

                    overlap = self._foreground_overlap(foreground, mask, local_x, local_y, scaled_w, scaled_h)
                    if overlap is None:
                        self._suppress_match_location(result, local_x, local_y, scaled_w, scaled_h)
                        continue
                    local_iou, precision, recall, local_foreground_area = overlap
                    slot_x0 = max(local_x, bounds[slot_index])
                    slot_x1 = min(local_x + scaled_w, bounds[slot_index + 1])
                    if slot_x0 >= slot_x1:
                        self._suppress_match_location(result, local_x, local_y, scaled_w, scaled_h)
                        continue
                    slot_foreground_area = int(
                        cv2.countNonZero(foreground[local_y : local_y + scaled_h, slot_x0:slot_x1])
                    )
                    slot_coverage = slot_foreground_area / slot_foreground_counts[slot_index]
                    if local_foreground_area < minimum_local_foreground:
                        self._suppress_match_location(result, local_x, local_y, scaled_w, scaled_h)
                        continue
                    if local_iou < 0.10 or precision < 0.18 or recall < 0.16:
                        self._suppress_match_location(result, local_x, local_y, scaled_w, scaled_h)
                        continue
                    if slot_coverage < 0.55:
                        self._suppress_match_location(result, local_x, local_y, scaled_w, scaled_h)
                        continue

                    color_score = self._masked_color_similarity(template, region, local_x, local_y, scaled_w, scaled_h)

                    overlap_score = local_iou * 0.55 + precision * 0.25 + recall * 0.20
                    position_score = 1 - min(1.0, abs(center_x - centers[slot_index]) / max(1.0, slot_width * 0.5))
                    size_score = min(1.0, (scaled_w * scaled_h) / max(1.0, slot_width * region_h * 0.42))
                    fused_score = (
                        self._apply_color_bonus(raw_score, color_score) * 0.42
                        + overlap_score * 0.22
                        + position_score * 0.08
                        + size_score * 0.04
                        + min(1.0, slot_coverage) * 0.24
                    )

                    candidate = MatchCandidate(
                        template=template,
                        score=fused_score,
                        x=local_x + offset[0],
                        y=local_y + offset[1],
                        w=scaled_w,
                        h=scaled_h,
                        region_name=region_name,
                        region_offset=offset,
                        method="opencv_slot_template_match",
                    )
                    slot_candidates[slot_index].append((fused_score, candidate))
                    self._suppress_match_location(result, local_x, local_y, scaled_w, scaled_h)

        selected: list[MatchCandidate] = []
        for candidates in slot_candidates:
            if not candidates:
                return []
            best_by_weapon: dict[str, tuple[float, MatchCandidate]] = {}
            for score, candidate in candidates:
                weapon_id = candidate.template.info.weapon_id
                if weapon_id not in best_by_weapon or score > best_by_weapon[weapon_id][0]:
                    best_by_weapon[weapon_id] = (score, candidate)
            ranked = sorted(best_by_weapon.values(), key=lambda item: item[0], reverse=True)
            if not ranked:
                return []
            fused_score, candidate = ranked[0]
            candidate.score = min(0.999, max(0.0, 0.90 + fused_score * 0.10))
            selected.append(candidate)

        return sorted(selected, key=lambda item: item.center[0])

    def _match_weapon_pill_even_slots(
        self, region_name: str, region: np.ndarray, offset: tuple[int, int]
    ) -> list[MatchCandidate]:
        """Fallback for visible top-bar icons when foreground component splitting fails.

        The weapon pill layout is stable: four icons in a horizontal row.
        This path splits the focused pill area into four even slots and matches
        each slot independently, avoiding loose whole-region false positives.
        """
        if not self.templates:
            return []

        region_h, region_w = region.shape[:2]
        if region_h < 22 or region_w < 90:
            return []

        foreground = self._pill_foreground_mask(region)
        points = cv2.findNonZero(foreground)

        if points is not None and len(points) >= 40:
            xs = points[:, 0, 0]
            left = int(np.percentile(xs, 1))
            right = int(np.percentile(xs, 99))
        else:
            left = 0
            right = region_w

        span = right - left
        if span < region_w * 0.45:
            left = 0
            right = region_w
            span = right - left

        pad = max(3, int(span * 0.035))
        left = max(0, left - pad)
        right = min(region_w, right + pad)
        span = right - left

        bounds = [int(round(left + span * i / 4)) for i in range(5)]
        region_gray = cv2.cvtColor(region, cv2.COLOR_BGR2GRAY)

        base_target = max(18, min(54, int(region_h * 0.68)))
        multipliers = (0.68, 0.80, 0.92, 1.04, 1.16, 1.30, 1.46)

        selected: list[MatchCandidate] = []

        for slot_index in range(4):
            slot_x0 = bounds[slot_index]
            slot_x1 = bounds[slot_index + 1]
            slot_w = slot_x1 - slot_x0
            if slot_w < 12:
                return []

            search_x0 = max(0, slot_x0 - int(slot_w * 0.25))
            search_x1 = min(region_w, slot_x1 + int(slot_w * 0.25))
            search = region_gray[:, search_x0:search_x1]
            search_color = region[:, search_x0:search_x1]

            best: MatchCandidate | None = None
            best_score = -1.0

            for template in self.templates:
                th, tw = template.gray.shape[:2]
                if th < 4 or tw < 4:
                    continue

                base_scale = base_target / max(th, tw)

                for multiplier in multipliers:
                    scale = base_scale * multiplier
                    scaled_w = max(8, int(tw * scale))
                    scaled_h = max(8, int(th * scale))

                    if scaled_w >= search.shape[1] or scaled_h >= search.shape[0]:
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
                        result = cv2.matchTemplate(search, resized, cv2.TM_CCORR_NORMED, mask=mask)
                    except cv2.error:
                        result = cv2.matchTemplate(search, resized, cv2.TM_CCOEFF_NORMED)

                    result = np.nan_to_num(result, nan=-1.0, posinf=-1.0, neginf=-1.0)
                    _, raw_score, _, max_loc = cv2.minMaxLoc(result)
                    raw_score = float(raw_score)

                    if raw_score < MATCH_MIN_SCORE:
                        continue

                    local_x, local_y = max_loc
                    global_x = search_x0 + local_x
                    center_x = global_x + scaled_w / 2
                    center_y = local_y + scaled_h / 2

                    # Candidate center must actually belong to this slot.
                    if center_x < slot_x0 - slot_w * 0.20 or center_x > slot_x1 + slot_w * 0.20:
                        continue
                    if center_y < region_h * 0.02 or center_y > region_h * 0.96:
                        continue

                    color_score = self._masked_color_similarity(
                        template,
                        search_color,
                        local_x,
                        local_y,
                        scaled_w,
                        scaled_h,
                    )
                    score = self._apply_color_bonus(raw_score, color_score)

                    # Prefer candidates centered in the slot and not absurdly tiny.
                    position_error = abs(center_x - ((slot_x0 + slot_x1) / 2)) / max(1.0, slot_w / 2)
                    position_bonus = max(0.0, 1.0 - position_error) * 0.012
                    size_bonus = min(0.010, (scaled_w * scaled_h) / max(1.0, region_h * slot_w) * 0.018)
                    score = min(0.999, score + position_bonus + size_bonus)

                    if score > best_score:
                        best_score = score
                        best = MatchCandidate(
                            template=template,
                            score=score,
                            x=global_x + offset[0],
                            y=local_y + offset[1],
                            w=scaled_w,
                            h=scaled_h,
                            region_name=region_name,
                            region_offset=offset,
                            method="opencv_slot_template_match",
                        )

            if best is None:
                return []

            selected.append(best)

        return sorted(selected, key=lambda item: item.center[0])

    def _color_adjusted_score(
        self,
        template: PreparedTemplate,
        region: np.ndarray,
        raw_score: float,
        x: int,
        y: int,
        w: int,
        h: int,
    ) -> float:
        color_score = self._masked_color_similarity(template, region, x, y, w, h)
        return self._apply_color_bonus(raw_score, color_score)

    @staticmethod
    def _apply_color_bonus(raw_score: float, color_score: float) -> float:
        if color_score <= 0:
            return raw_score
        return min(0.999, max(0.0, raw_score + (color_score - 0.55) * 0.08))

    @staticmethod
    def _masked_color_similarity(
        template: PreparedTemplate,
        region: np.ndarray,
        x: int,
        y: int,
        w: int,
        h: int,
    ) -> float:
        if x < 0 or y < 0 or x + w > region.shape[1] or y + h > region.shape[0]:
            return 0.0
        crop = region[y : y + h, x : x + w]
        resized_bgr = cv2.resize(template.bgr, (w, h), interpolation=cv2.INTER_AREA)
        if template.mask is not None:
            mask = cv2.resize(template.mask, (w, h), interpolation=cv2.INTER_NEAREST)
            foreground = mask > 0
        else:
            foreground = np.ones((h, w), dtype=bool)
        if np.count_nonzero(foreground) < 8:
            return 0.0

        crop_hsv = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV).astype(np.float32)
        template_hsv = cv2.cvtColor(resized_bgr, cv2.COLOR_BGR2HSV).astype(np.float32)
        hue_delta = np.abs(crop_hsv[:, :, 0] - template_hsv[:, :, 0])
        hue_delta = np.minimum(hue_delta, 180 - hue_delta) / 90.0
        saturation_delta = np.abs(crop_hsv[:, :, 1] - template_hsv[:, :, 1]) / 255.0
        value_delta = np.abs(crop_hsv[:, :, 2] - template_hsv[:, :, 2]) / 255.0
        distance = hue_delta * 0.45 + saturation_delta * 0.25 + value_delta * 0.30
        return float(np.mean(1 - distance[foreground]))

    @staticmethod
    def _pill_foreground_mask(region: np.ndarray) -> np.ndarray:
        hsv = cv2.cvtColor(region, cv2.COLOR_BGR2HSV)
        gray = cv2.cvtColor(region, cv2.COLOR_BGR2GRAY)
        saturation = hsv[:, :, 1]
        value = hsv[:, :, 2]
        foreground = np.where(((saturation > 35) & (value > 45)) | (gray > 85), 255, 0).astype(np.uint8)
        foreground = cv2.morphologyEx(foreground, cv2.MORPH_OPEN, np.ones((2, 2), dtype=np.uint8))
        foreground = cv2.morphologyEx(foreground, cv2.MORPH_CLOSE, np.ones((2, 2), dtype=np.uint8))
        return foreground

    @staticmethod
    def _slot_geometry_from_foreground(foreground: np.ndarray) -> tuple[list[float], list[int]] | None:
        points = cv2.findNonZero(foreground)
        if points is None or len(points) < 80:
            return None

        foreground_h, foreground_w = foreground.shape[:2]
        closed = cv2.morphologyEx(foreground, cv2.MORPH_CLOSE, np.ones((5, 7), dtype=np.uint8))
        contours, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        components: list[tuple[int, float]] = []
        min_pixels = max(48, int(foreground_h * foreground_w * 0.006))
        for contour in contours:
            x, y, w, h = cv2.boundingRect(contour)
            pixels = int(cv2.countNonZero(closed[y : y + h, x : x + w]))
            if pixels < min_pixels:
                continue
            if x <= foreground_w * 0.06 and w <= foreground_w * 0.08:
                continue
            if w < foreground_w * 0.035 or h < foreground_h * 0.18:
                continue
            if w > foreground_w * 0.85 and h > foreground_h * 0.60:
                continue
            components.append((pixels, x + w / 2))

        if len(components) >= 4:
            sorted_centers = sorted(center for _, center in sorted(components, reverse=True)[:4])
            min_gap = foreground_w * 0.075
            if sorted_centers[-1] - sorted_centers[0] >= foreground_w * 0.35 and not any(
                (right - left) < min_gap for left, right in zip(sorted_centers, sorted_centers[1:])
            ):
                bounds = [0]
                for left, right in zip(sorted_centers, sorted_centers[1:]):
                    bounds.append(int(round((left + right) / 2)))
                bounds.append(foreground_w)
                return sorted_centers, bounds

        xs = points[:, 0, 0].astype(np.float32)
        criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 30, 0.2)
        compactness, _, centers = cv2.kmeans(xs.reshape(-1, 1), 4, None, criteria, 4, cv2.KMEANS_PP_CENTERS)
        if not math.isfinite(float(compactness)):
            return None
        sorted_centers = sorted(float(center[0]) for center in centers)
        if sorted_centers[-1] - sorted_centers[0] < foreground.shape[1] * 0.35:
            return None
        min_gap = foreground.shape[1] * 0.075
        if any((right - left) < min_gap for left, right in zip(sorted_centers, sorted_centers[1:])):
            return None

        bounds = [0]
        for left, right in zip(sorted_centers, sorted_centers[1:]):
            bounds.append(int(round((left + right) / 2)))
        bounds.append(foreground.shape[1])
        return sorted_centers, bounds

    @staticmethod
    def _foreground_overlap(
        foreground: np.ndarray,
        template_mask: np.ndarray | None,
        x: int,
        y: int,
        w: int,
        h: int,
    ) -> tuple[float, float, float, int] | None:
        if template_mask is None:
            candidate_mask = np.full((h, w), 255, dtype=np.uint8)
        else:
            candidate_mask = cv2.resize(template_mask, (w, h), interpolation=cv2.INTER_NEAREST)
            candidate_mask = np.where(candidate_mask > 0, 255, 0).astype(np.uint8)

        if x < 0 or y < 0 or x + w > foreground.shape[1] or y + h > foreground.shape[0]:
            return None
        local_foreground = foreground[y : y + h, x : x + w]
        foreground_area = int(cv2.countNonZero(local_foreground))
        candidate_area = int(cv2.countNonZero(candidate_mask))
        if foreground_area <= 0 or candidate_area <= 0:
            return None
        intersection = int(cv2.countNonZero(cv2.bitwise_and(local_foreground, candidate_mask)))
        union = foreground_area + candidate_area - intersection
        local_iou = intersection / union if union else 0.0
        precision = intersection / candidate_area
        recall = intersection / foreground_area
        return local_iou, precision, recall, foreground_area

    @staticmethod
    def _suppress_match_location(result: np.ndarray, x: int, y: int, w: int, h: int) -> None:
        radius_x = max(3, int(w * 0.45))
        radius_y = max(3, int(h * 0.45))
        x0 = max(0, x - radius_x)
        y0 = max(0, y - radius_y)
        x1 = min(result.shape[1], x + radius_x)
        y1 = min(result.shape[0], y + radius_y)
        result[y0:y1, x0:x1] = -1.0

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

        best_group = max(usable_groups, key=self._row_score)
        best_group = sorted(best_group, key=lambda item: item.score, reverse=True)
        best_group = self._nms(best_group, iou_threshold=0.18, center_distance_factor=0.82)
        best_group = self._best_even_row_sequence(best_group)
        return best_group

    @staticmethod
    def _is_plausible_icon_candidate(candidate: MatchCandidate) -> bool:
        if "weapon_pill" not in candidate.region_name:
            return True
        area = candidate.w * candidate.h
        if area < 90:
            return False
        if max(candidate.w, candidate.h) < 12:
            return False
        if min(candidate.w, candidate.h) < 7:
            return False
        aspect = candidate.w / max(1, candidate.h)
        return 0.25 <= aspect <= 4.0

    @staticmethod
    def _group_score(group: list[MatchCandidate]) -> float:
        if not group:
            return 0
        scores = [item.score for item in group[:4]]
        count_bonus = min(4, len(group)) * 0.04
        span = max(item.center[0] for item in group) - min(item.center[0] for item in group)
        span_bonus = min(0.1, span / 1600)
        return float(sum(scores) / len(scores) + count_bonus + span_bonus)

    def _row_score(self, group: list[MatchCandidate]) -> float:
        score = self._group_score(group)
        if not group or "weapon_pill" not in group[0].region_name:
            return score

        local_y_values = [item.center[1] - item.region_offset[1] for item in group]
        median_local_y = float(np.median(local_y_values))
        median_h = float(np.median([item.h for item in group]))

        # In the focused weapon pill crop, the shift icons sit in the upper row.
        # Lower rows are usually artifacts from the score-panel boundary or tiny
        # player-row icons that happen to resemble weapon silhouettes.
        top_row_bonus = max(0.0, 0.22 - median_local_y / 155.0)
        lower_row_penalty = max(0.0, (median_local_y - median_h * 1.45) / 95.0)
        return score + top_row_bonus - lower_row_penalty

    @staticmethod
    def _best_even_row_sequence(candidates: list[MatchCandidate]) -> list[MatchCandidate]:
        if len(candidates) <= 4:
            return sorted(candidates[:4], key=lambda item: item.center[0])

        pool = sorted(candidates, key=lambda item: (item.score, item.w * item.h), reverse=True)[:14]
        best_score = -1e9
        best_combo: tuple[MatchCandidate, ...] | None = None
        for combo in combinations(pool, 4):
            ordered = tuple(sorted(combo, key=lambda item: item.center[0]))
            gaps = np.array([right.center[0] - left.center[0] for left, right in zip(ordered, ordered[1:])], dtype=np.float32)
            if float(np.min(gaps)) < max(18.0, float(np.median([item.w for item in ordered])) * 0.95):
                continue
            if float(np.max(gaps)) > max(58.0, float(np.median(gaps)) * 1.85):
                continue
            gap_cv = float(np.std(gaps) / max(1.0, np.mean(gaps)))
            span = ordered[-1].center[0] - ordered[0].center[0]
            avg_score = float(np.mean([item.score for item in ordered]))
            avg_area = float(np.mean([item.w * item.h for item in ordered]))
            area_bonus = min(0.025, avg_area / 32000.0)
            span_bonus = min(0.035, span / 4200.0)
            sequence_score = avg_score + area_bonus + span_bonus - gap_cv * 0.055
            if sequence_score > best_score:
                best_score = sequence_score
                best_combo = ordered

        if best_combo is None:
            return sorted(candidates[:4], key=lambda item: item.center[0])
        return list(best_combo)

    @staticmethod
    def _is_accepted_group(group: list[MatchCandidate], confidence: float, scores: list[float]) -> bool:
        if len(group) != 4 or not scores:
            return False

        method = group[0].method

        centers_x = sorted(item.center[0] for item in group)
        centers_y = [item.center[1] for item in group]
        widths = [item.w for item in group]
        heights = [item.h for item in group]

        median_w = float(np.median(widths))
        median_h = float(np.median(heights))
        gaps = [right - left for left, right in zip(centers_x, centers_x[1:])]
        y_spread = max(centers_y) - min(centers_y)

        # Must be four separate horizontal objects.
        if min(gaps) < max(18.0, median_w * 0.85):
            return False

        # Must be on the same visual row.
        if y_spread > max(14.0, median_h * 0.85):
            return False

        # Reject duplicate/overlapping boxes.
        for left, right in combinations(group, 2):
            if _iou(left, right) > 0.10:
                return False

        if method == "opencv_slot_template_match":
            return confidence >= ACCEPT_AVG_SCORE and min(scores) >= ACCEPT_MIN_SCORE

        if method == "opencv_color_template_match":
            # Allow color fallback only when it is extremely confident.
            # This should allow 2.png, but still reject IMG_3649.JPG.
            return confidence >= 0.992 and min(scores) >= 0.985

        return False

    @staticmethod
    def _nms(
        candidates: list[MatchCandidate],
        iou_threshold: float = 0.28,
        center_distance_factor: float = 0.55,
    ) -> list[MatchCandidate]:
        selected: list[MatchCandidate] = []
        for candidate in sorted(candidates, key=lambda item: (item.score, item.w * item.h), reverse=True):
            if any(_iou(candidate, kept) > iou_threshold for kept in selected):
                continue
            if any(
                _center_distance(candidate, kept) < max(candidate.w, candidate.h, kept.w, kept.h) * center_distance_factor
                for kept in selected
            ):
                continue
            selected.append(candidate)
            if len(selected) >= 28:
                break
        return selected

    def _best_candidate_group(self, groups: list[tuple[str, list[MatchCandidate]]]) -> tuple[str, list[MatchCandidate]]:
        accepted: list[tuple[str, list[MatchCandidate]]] = []
        for region_name, group in groups:
            scores = [item.score for item in group]
            confidence = float(sum(scores) / max(1, len(scores))) * min(1.0, len(group) / 4)
            if self._is_accepted_group(group, confidence, scores):
                accepted.append((region_name, group))

        slot_groups = [item for item in accepted if item[1] and item[1][0].method == "opencv_slot_template_match"]
        if slot_groups:
            return max(slot_groups, key=lambda item: self._group_score(item[1]))
        if accepted:
            return max(accepted, key=lambda item: self._group_score(item[1]))
        return max(groups, key=lambda item: self._group_score(item[1]))

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
                    method=match.method,
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
