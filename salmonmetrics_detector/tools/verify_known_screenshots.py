from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP_ROOT = ROOT.parent
sys.path.insert(0, str(APP_ROOT))

from salmonmetrics_detector.app.detector import SERVICE_VERSION, WeaponDetector


@dataclass(frozen=True)
class ExpectedCase:
    filename: str
    mode: str
    weapon_ids: tuple[str, ...]


@dataclass(frozen=True)
class NegativeCase:
    filename: str


DEFAULT_CASES = (
    ExpectedCase("1.png", "fixed_weapons", ("sputtery", "splatroller", "maneuver", "jetsweeper")),
    ExpectedCase("2.png", "fixed_weapons", ("sshooter", "hotblaster", "splatroller", "liter4k")),
    ExpectedCase("3.png", "random_weapons", ("random", "random", "random", "random")),
    ExpectedCase("4.png", "fixed_weapons", ("dentalwiper_mint", "kugelschreiber", "hissen", "tristringer")),
    ExpectedCase("IMG_3649.JPG", "fixed_weapons", ("lact450", "drivewiper", "longblaster", "96gal")),
    ExpectedCase("IMG_4253.JPG", "fixed_weapons", ("bottlegeyser", "parashelter", "sharp", "squiclean_a")),
    ExpectedCase("IMG_4255.JPG", "fixed_weapons", ("spygadget", "promodeler_mg", "gaen_ff", "rapid_elite")),
    ExpectedCase("IMG_4255_weapon_crop.png", "fixed_weapons", ("spygadget", "promodeler_mg", "gaen_ff", "rapid_elite")),
    ExpectedCase("online_1.png", "fixed_weapons", ("fincent", "52gal", "nzap85", "bamboo14mk1")),
    ExpectedCase("online_2.png", "fixed_weapons", ("52gal", "l3reelgun", "moprin", "squiclean_a")),
    ExpectedCase("online_3.png", "fixed_weapons", ("hissen", "sharp", "bucketslosher", "96gal")),
    ExpectedCase("online_4.png", "fixed_weapons", ("sshooter", "kelvin525", "squiclean_a", "random")),
    ExpectedCase("online_5.png", "fixed_weapons", ("52gal", "hotblaster", "jetsweeper", "barrelspinner")),
)

DEFAULT_NEGATIVE_CASES = (
    NegativeCase("Mualani-69ad399dbeebbaaa668ed911.png"),
)

DEFAULT_REPO_SCREENSHOTS_DIR = ROOT / "assets" / "regression_screenshots"
DEFAULT_LOCAL_DOWNLOADS_DIR = Path(r"C:\Users\Amir\Downloads")


def parse_args() -> argparse.Namespace:
    default_downloads_dir = DEFAULT_REPO_SCREENSHOTS_DIR if DEFAULT_REPO_SCREENSHOTS_DIR.exists() else DEFAULT_LOCAL_DOWNLOADS_DIR
    parser = argparse.ArgumentParser(description="Run local detector regression checks against confirmed screenshots.")
    parser.add_argument(
        "--downloads-dir",
        type=Path,
        default=default_downloads_dir,
        help="Folder containing confirmed regression screenshots. Defaults to repo fixtures when present.",
    )
    parser.add_argument("--json", action="store_true", help="Emit machine-readable JSON output.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    detector = WeaponDetector()
    rows: list[dict] = []
    ok = True

    for case in DEFAULT_CASES:
        path = args.downloads_dir / case.filename
        if not path.exists():
            ok = False
            rows.append({"file": case.filename, "ok": False, "error": f"missing file: {path}"})
            continue

        response = detector.detect(path.read_bytes())
        ids = tuple(weapon.weapon_id for weapon in response.weapons)
        passed = response.mode == case.mode and ids == case.weapon_ids
        ok = ok and passed
        rows.append(
            {
                "file": case.filename,
                "ok": passed,
                "mode": response.mode,
                "source": response.source,
                "confidence": response.confidence,
                "needs_review": response.needs_review,
                "weapon_ids": ids,
                "expected_mode": case.mode,
                "expected_weapon_ids": case.weapon_ids,
                "methods": tuple(weapon.method for weapon in response.weapons),
                "scores": tuple(weapon.confidence for weapon in response.weapons),
                "boxes": tuple(weapon.box.model_dump() if weapon.box else None for weapon in response.weapons),
            }
        )

    negative_rows: list[dict] = []
    for case in DEFAULT_NEGATIVE_CASES:
        path = args.downloads_dir / case.filename
        if not path.exists():
            negative_rows.append({"file": case.filename, "ok": True, "skipped": True, "reason": "missing optional negative"})
            continue

        response = detector.detect(path.read_bytes())
        ids = tuple(weapon.weapon_id for weapon in response.weapons)
        passed = response.mode not in {"fixed_weapons", "random_weapons"} and not ids
        ok = ok and passed
        negative_rows.append(
            {
                "file": case.filename,
                "ok": passed,
                "mode": response.mode,
                "source": response.source,
                "confidence": response.confidence,
                "needs_review": response.needs_review,
                "weapon_ids": ids,
                "methods": tuple(weapon.method for weapon in response.weapons),
                "scores": tuple(weapon.confidence for weapon in response.weapons),
                "boxes": tuple(weapon.box.model_dump() if weapon.box else None for weapon in response.weapons),
            }
        )

    payload = {
        "ok": ok,
        "version": SERVICE_VERSION,
        "templates": detector.template_count(),
        "cases": rows,
        "negative_cases": negative_rows,
    }
    if args.json:
        print(json.dumps(payload, ensure_ascii=False, indent=2))
    else:
        print(f"detector={SERVICE_VERSION} templates={detector.template_count()} ok={ok}")
        for row in rows:
            status = "OK" if row["ok"] else "FAIL"
            if "error" in row:
                print(f"{status} {row['file']}: {row['error']}")
                continue
            print(
                f"{status} {row['file']}: mode={row['mode']} source={row['source']} "
                f"confidence={row['confidence']} ids={','.join(row['weapon_ids'])}"
            )
        for row in negative_rows:
            status = "OK" if row["ok"] else "FAIL"
            if row.get("skipped"):
                print(f"{status} negative {row['file']}: skipped ({row['reason']})")
                continue
            print(
                f"{status} negative {row['file']}: mode={row['mode']} source={row['source']} "
                f"confidence={row['confidence']} ids={','.join(row['weapon_ids'])}"
            )
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
