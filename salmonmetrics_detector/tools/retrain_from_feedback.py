from __future__ import annotations

import argparse
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP_ROOT = ROOT.parent
MODEL_DIR = ROOT / "assets" / "models"
MODEL_PATHS = (
    MODEL_DIR / "weapon_icon_classifier.pt",
    MODEL_DIR / "weapon_icon_classifier.onnx",
    MODEL_DIR / "weapon_icon_labels.json",
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Import weapon correction feedback, retrain, and verify the classifier.")
    parser.add_argument("--feedback-url", default="https://salmonmetrics.pages.dev/api/weapon-feedback")
    parser.add_argument("--token", default=os.getenv("WEAPON_FEEDBACK_EXPORT_TOKEN", ""))
    parser.add_argument("--feedback-dir", type=Path, default=None)
    parser.add_argument("--epochs", type=int, default=8)
    parser.add_argument("--samples", type=int, default=14000)
    parser.add_argument("--batch-size", type=int, default=192)
    parser.add_argument("--threads", type=int, default=4)
    parser.add_argument("--real-fraction", type=float, default=0.76)
    parser.add_argument("--unknown-fraction", type=float, default=0.12)
    parser.add_argument("--skip-import", action="store_true")
    parser.add_argument("--skip-verify", action="store_true")
    parser.add_argument("--restore-on-verify-failure", action="store_true")
    parser.add_argument("--allow-verify-failure", action="store_true")
    return parser.parse_args()


def run(command: list[str]) -> None:
    print("+", " ".join(masked_command(command)))
    subprocess.run(command, cwd=str(APP_ROOT), check=True)


def masked_command(command: list[str]) -> list[str]:
    masked = list(command)
    for index, value in enumerate(masked[:-1]):
        if value == "--token":
            masked[index + 1] = "***"
    return masked


def snapshot_model_files() -> dict[Path, bytes | None]:
    return {path: path.read_bytes() if path.exists() else None for path in MODEL_PATHS}


def restore_model_files(snapshot: dict[Path, bytes | None]) -> None:
    for path, data in snapshot.items():
        if data is None:
            if path.exists():
                path.unlink()
            continue
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)


def main() -> int:
    args = parse_args()

    if not args.skip_import:
        import_command = [sys.executable, "salmonmetrics_detector/tools/import_weapon_feedback.py"]
        if args.feedback_dir:
            import_command += ["--feedback-dir", str(args.feedback_dir)]
        else:
            import_command += ["--feedback-url", args.feedback_url]
            if args.token:
                import_command += ["--token", args.token]
        run(import_command)

    snapshot = snapshot_model_files() if args.restore_on_verify_failure else {}

    try:
        run(
            [
                sys.executable,
                "salmonmetrics_detector/tools/train_weapon_cnn.py",
                "--epochs",
                str(args.epochs),
                "--samples",
                str(args.samples),
                "--batch-size",
                str(args.batch_size),
                "--threads",
                str(args.threads),
                "--real-fraction",
                str(args.real_fraction),
                "--unknown-fraction",
                str(args.unknown_fraction),
            ]
        )
    except subprocess.CalledProcessError:
        if snapshot:
            restore_model_files(snapshot)
        raise

    if not args.skip_verify:
        try:
            run([sys.executable, "salmonmetrics_detector/tools/verify_known_screenshots.py"])
        except subprocess.CalledProcessError:
            if snapshot:
                restore_model_files(snapshot)
                print("verification failed; restored previous classifier artifacts")
            if args.allow_verify_failure:
                print("verification failed; keeping imported feedback crops but skipping model promotion")
                return 0
            raise

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
