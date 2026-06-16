from __future__ import annotations

import argparse
import base64
import json
import os
import re
import sys
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
APP_ROOT = ROOT.parent
sys.path.insert(0, str(APP_ROOT))

from salmonmetrics_detector.app.detector import DEFAULT_TEMPLATE_DIR, WeaponDetector
from salmonmetrics_detector.app.weapon_catalog import WeaponTemplateInfo, load_weapon_catalog


DEFAULT_FEEDBACK_API = "https://salmonmetrics.pages.dev/api/weapon-feedback"
DEFAULT_OUTPUT_DIR = ROOT / "assets" / "training" / "real_weapon_crops"
DEFAULT_IMPORT_DIR = ROOT / "assets" / "training" / "feedback_imports"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Import user-corrected weapon feedback into real crop training data.")
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--feedback-dir", type=Path, help="Directory containing feedback JSON records.")
    source.add_argument("--feedback-file", type=Path, help="Single feedback JSON file.")
    source.add_argument("--feedback-url", default="", help="Feedback export API URL. Use with --token or env token.")
    parser.add_argument("--token", default=os.getenv("WEAPON_FEEDBACK_EXPORT_TOKEN", ""), help="Feedback export token.")
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--import-log-dir", type=Path, default=DEFAULT_IMPORT_DIR)
    parser.add_argument("--limit", type=int, default=1000)
    parser.add_argument("--changed-only", action="store_true", help="Import only changed slots instead of all four corrected slots.")
    parser.add_argument("--dry-run", action="store_true")
    return parser.parse_args()


class WeaponNameResolver:
    def __init__(self, catalog: list[WeaponTemplateInfo]) -> None:
        self.by_name: dict[str, str] = {}
        for item in catalog:
            values = [item.weapon_id, item.name_ja, item.name_en, *item.aliases]
            for value in values:
                key = normalize_weapon_text(value)
                if key:
                    self.by_name[key] = item.weapon_id

    def resolve(self, value: str) -> str | None:
        return self.by_name.get(normalize_weapon_text(value))


def normalize_weapon_text(value: str) -> str:
    text = str(value or "").strip().lower()
    text = text.replace("　", " ")
    text = re.sub(r"[\s_\-./・'\"()（）\[\]【】]+", "", text)
    return text


def safe_slug(value: str, fallback: str = "feedback") -> str:
    text = re.sub(r"[^A-Za-z0-9_.-]+", "_", str(value or "").strip())
    return text.strip("._")[:96] or fallback


def load_feedback_records(args: argparse.Namespace) -> list[tuple[str, dict[str, Any]]]:
    if args.feedback_file:
        return [(str(args.feedback_file), json.loads(args.feedback_file.read_text(encoding="utf-8")))]

    if args.feedback_dir:
        records: list[tuple[str, dict[str, Any]]] = []
        for path in sorted(args.feedback_dir.rglob("*.json")):
            records.append((str(path), json.loads(path.read_text(encoding="utf-8"))))
        return records

    return fetch_feedback_records(args.feedback_url or DEFAULT_FEEDBACK_API, args.token, args.limit)


def fetch_feedback_records(url: str, token: str, limit: int) -> list[tuple[str, dict[str, Any]]]:
    if not token:
        raise RuntimeError("--token or WEAPON_FEEDBACK_EXPORT_TOKEN is required for --feedback-url")

    output: list[tuple[str, dict[str, Any]]] = []
    cursor = ""
    while True:
        parsed = urllib.parse.urlparse(url)
        query = dict(urllib.parse.parse_qsl(parsed.query))
        query.update({"include": "records", "limit": str(min(max(limit, 1), 1000))})
        if cursor:
            query["cursor"] = cursor
        target = urllib.parse.urlunparse(parsed._replace(query=urllib.parse.urlencode(query)))
        request = urllib.request.Request(target, headers={"x-feedback-token": token, "accept": "application/json"})
        with urllib.request.urlopen(request, timeout=60) as response:
            payload = json.loads(response.read().decode("utf-8"))
        if not payload.get("ok"):
            raise RuntimeError(f"feedback API returned failure: {payload}")
        for item in payload.get("records", []):
            record = item.get("record") or {}
            output.append((str(item.get("key") or record.get("id") or "feedback"), record))
        if payload.get("list_complete") or not payload.get("cursor"):
            break
        cursor = str(payload.get("cursor") or "")
    return output


def feedback_image_bytes(record: dict[str, Any]) -> bytes | None:
    images = record.get("images") if isinstance(record.get("images"), dict) else {}
    image = images.get("weapons") or images.get("full") or record.get("image") or {}
    if isinstance(image, str):
        match = re.match(r"^data:[^;,]+;base64,(.+)$", image.strip(), flags=re.S)
        if not match:
            return None
        return base64.b64decode(re.sub(r"\s+", "", match.group(1)))
    if isinstance(image, dict) and image.get("base64"):
        return base64.b64decode(re.sub(r"\s+", "", str(image.get("base64"))))
    return None


def corrected_weapon_ids(
    record: dict[str, Any],
    resolver: WeaponNameResolver,
    changed_only: bool,
) -> list[tuple[int, str]]:
    corrected = record.get("correctedWeapons")
    if not isinstance(corrected, list):
        corrected = []
    corrected = [str(item or "") for item in corrected[:4]]
    while len(corrected) < 4:
        corrected.append("")

    changed_slots = set()
    for item in record.get("changedSlots") or []:
        try:
            slot = int(item.get("slot"))
        except Exception:
            slot = 0
        if 1 <= slot <= 4:
            changed_slots.add(slot)

    output: list[tuple[int, str]] = []
    for index, weapon_name in enumerate(corrected, start=1):
        if changed_only and index not in changed_slots:
            continue
        weapon_id = resolver.resolve(weapon_name)
        if weapon_id:
            output.append((index, weapon_id))
    return output


def extract_slot_crops(detector: WeaponDetector, image_bytes: bytes) -> list[np.ndarray]:
    image = detector._decode_image(image_bytes)
    if image is None:
        return []
    image, _ = detector._normalize_image(image)

    candidates: list[np.ndarray] = []
    for region_name, region, offset in detector._candidate_regions(image):
        focused = detector._focus_weapon_region(region_name, region, offset)
        if focused is not None:
            candidates.append(focused[1])
    candidates.append(image)

    for region in candidates:
        crops = slot_crops_from_region(detector, region)
        if len(crops) == 4:
            return crops
    return []


def slot_crops_from_region(detector: WeaponDetector, region: np.ndarray) -> list[np.ndarray]:
    span = detector._component_slot_span(region)
    if span is None:
        groups = detector._weapon_component_box_groups(region)
        if groups:
            boxes = sorted(groups[0], key=lambda item: item[0] + item[2] / 2)
            crops = [crop_with_padding(region, x, y, w, h, pad_ratio=0.58) for x, y, w, h in boxes[:4]]
            crops = [crop for crop in crops if crop is not None]
            if len(crops) == 4:
                return crops
        return []

    x0, x1, y0, y1 = span
    width = x1 - x0
    height = y1 - y0
    if width < 24 or height < 6:
        return []

    crops: list[np.ndarray] = []
    bounds = [int(round(x0 + width * index / 4)) for index in range(5)]
    for index in range(4):
        slot_x0 = bounds[index]
        slot_x1 = bounds[index + 1]
        slot_w = max(1, slot_x1 - slot_x0)
        x_pad = max(3, int(slot_w * 0.22))
        y_pad = max(5, int(height * 0.62))
        cx0 = max(0, slot_x0 - x_pad)
        cx1 = min(region.shape[1], slot_x1 + x_pad)
        cy0 = max(0, y0 - y_pad)
        cy1 = min(region.shape[0], y1 + y_pad)
        crop = region[cy0:cy1, cx0:cx1]
        if crop.shape[0] < 4 or crop.shape[1] < 4:
            return []
        crops.append(crop)
    return crops


def crop_with_padding(region: np.ndarray, x: int, y: int, w: int, h: int, pad_ratio: float) -> np.ndarray | None:
    pad = max(3, int(max(w, h) * pad_ratio))
    x0 = max(0, x - pad)
    y0 = max(0, y - pad)
    x1 = min(region.shape[1], x + w + pad)
    y1 = min(region.shape[0], y + h + pad)
    if x0 >= x1 or y0 >= y1:
        return None
    return region[y0:y1, x0:x1]


def import_records(args: argparse.Namespace) -> int:
    catalog = load_weapon_catalog(DEFAULT_TEMPLATE_DIR)
    resolver = WeaponNameResolver(catalog)
    detector = WeaponDetector()
    records = load_feedback_records(args)

    imported = 0
    skipped = 0
    args.output_dir.mkdir(parents=True, exist_ok=True)
    args.import_log_dir.mkdir(parents=True, exist_ok=True)

    for source, record in records:
        record_id = safe_slug(str(record.get("id") or Path(source).stem))
        image_bytes = feedback_image_bytes(record)
        labels = corrected_weapon_ids(record, resolver, args.changed_only)
        if not image_bytes or not labels:
            skipped += 1
            print(f"SKIP {record_id}: missing image or resolvable corrected labels")
            continue

        crops = extract_slot_crops(detector, image_bytes)
        if len(crops) != 4:
            skipped += 1
            print(f"SKIP {record_id}: could not extract four slot crops")
            continue

        written: list[dict[str, Any]] = []
        for slot, weapon_id in labels:
            crop = crops[slot - 1]
            weapon_dir = args.output_dir / weapon_id
            filename = f"feedback_{record_id}_slot{slot}.png"
            output_path = weapon_dir / filename
            if output_path.exists():
                continue
            if not args.dry_run:
                weapon_dir.mkdir(parents=True, exist_ok=True)
                cv2.imwrite(str(output_path), crop)
            written.append({"slot": slot, "weapon_id": weapon_id, "path": str(output_path)})
            imported += 1

        if written and not args.dry_run:
            sidecar = args.import_log_dir / f"{record_id}.json"
            sidecar.write_text(
                json.dumps(
                    {
                        "feedback_id": record.get("id") or record_id,
                        "source": source,
                        "written": written,
                        "createdAt": record.get("createdAt", ""),
                    },
                    ensure_ascii=False,
                    indent=2,
                ),
                encoding="utf-8",
            )
        print(f"{'DRY ' if args.dry_run else ''}IMPORT {record_id}: {len(written)} crops")

    print(json.dumps({"records": len(records), "imported_crops": imported, "skipped_records": skipped}, indent=2))
    return 0


def main() -> int:
    args = parse_args()
    return import_records(args)


if __name__ == "__main__":
    raise SystemExit(main())
