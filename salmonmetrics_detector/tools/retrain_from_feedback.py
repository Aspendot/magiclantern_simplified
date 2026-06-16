from __future__ import annotations

import argparse
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP_ROOT = ROOT.parent


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
    parser.add_argument("--skip-verify", action="store_true")
    return parser.parse_args()


def run(command: list[str]) -> None:
    print("+", " ".join(command))
    subprocess.run(command, cwd=str(APP_ROOT), check=True)


def main() -> int:
    args = parse_args()

    import_command = [sys.executable, "salmonmetrics_detector/tools/import_weapon_feedback.py"]
    if args.feedback_dir:
        import_command += ["--feedback-dir", str(args.feedback_dir)]
    else:
        import_command += ["--feedback-url", args.feedback_url]
        if args.token:
            import_command += ["--token", args.token]
    run(import_command)

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

    if not args.skip_verify:
        run([sys.executable, "salmonmetrics_detector/tools/verify_known_screenshots.py"])

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
