from __future__ import annotations

import argparse
import json
import random
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import DataLoader, Dataset

ROOT = Path(__file__).resolve().parents[1]
APP_ROOT = ROOT.parent
import sys

sys.path.insert(0, str(APP_ROOT))

from salmonmetrics_detector.app.weapon_catalog import WeaponTemplateInfo, load_weapon_catalog


IMAGE_SIZE = 64
UNKNOWN_LABEL = "__unknown__"


class WeaponIconNet(nn.Module):
    def __init__(self, class_count: int) -> None:
        super().__init__()
        self.features = nn.Sequential(
            nn.Conv2d(3, 32, 3, padding=1),
            nn.BatchNorm2d(32),
            nn.ReLU(inplace=True),
            nn.MaxPool2d(2),
            nn.Conv2d(32, 64, 3, padding=1),
            nn.BatchNorm2d(64),
            nn.ReLU(inplace=True),
            nn.MaxPool2d(2),
            nn.Conv2d(64, 128, 3, padding=1),
            nn.BatchNorm2d(128),
            nn.ReLU(inplace=True),
            nn.MaxPool2d(2),
            nn.Conv2d(128, 192, 3, padding=1),
            nn.BatchNorm2d(192),
            nn.ReLU(inplace=True),
            nn.AdaptiveAvgPool2d(1),
        )
        self.head = nn.Sequential(
            nn.Flatten(),
            nn.Dropout(0.15),
            nn.Linear(192, class_count),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.head(self.features(x))


@dataclass(frozen=True)
class TemplateImage:
    info: WeaponTemplateInfo
    bgr: np.ndarray
    alpha: np.ndarray


def _load_template_image(info: WeaponTemplateInfo) -> TemplateImage | None:
    raw = cv2.imread(str(info.path), cv2.IMREAD_UNCHANGED)
    if raw is None:
        return None

    if raw.ndim == 3 and raw.shape[2] == 4:
        bgr = raw[:, :, :3]
        alpha = raw[:, :, 3]
    else:
        bgr = raw[:, :, :3] if raw.ndim == 3 else cv2.cvtColor(raw, cv2.COLOR_GRAY2BGR)
        gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
        alpha = np.where(gray > 8, 255, 0).astype(np.uint8)

    points = cv2.findNonZero(alpha)
    if points is None:
        return None
    x, y, w, h = cv2.boundingRect(points)
    pad = 2
    x0 = max(0, x - pad)
    y0 = max(0, y - pad)
    x1 = min(bgr.shape[1], x + w + pad)
    y1 = min(bgr.shape[0], y + h + pad)
    return TemplateImage(info=info, bgr=bgr[y0:y1, x0:x1], alpha=alpha[y0:y1, x0:x1])


def _dark_canvas(rng: np.random.Generator) -> np.ndarray:
    base = np.array(
        [
            rng.integers(12, 36),
            rng.integers(4, 18),
            rng.integers(2, 12),
        ],
        dtype=np.int16,
    )
    noise = rng.integers(-6, 7, (IMAGE_SIZE, IMAGE_SIZE, 3), dtype=np.int16)
    canvas = np.clip(base + noise, 0, 255).astype(np.uint8)
    if rng.random() < 0.45:
        radius = rng.uniform(30, 90)
        cx = rng.uniform(-20, IMAGE_SIZE + 20)
        cy = rng.uniform(-20, IMAGE_SIZE + 20)
        color = np.array([rng.integers(8, 40), rng.integers(4, 25), rng.integers(2, 18)], dtype=np.float32)
        yy, xx = np.mgrid[:IMAGE_SIZE, :IMAGE_SIZE]
        alpha = np.clip(1 - np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2) / radius, 0, 1)[..., None] * 0.45
        canvas = np.clip(canvas.astype(np.float32) * (1 - alpha) + color * alpha, 0, 255).astype(np.uint8)
    return canvas


def _paste_template(
    canvas: np.ndarray,
    template: TemplateImage,
    rng: np.random.Generator,
    centered: bool = True,
    partial: bool = False,
) -> np.ndarray:
    bgr = template.bgr
    alpha = template.alpha
    h, w = alpha.shape[:2]
    # Runtime scan windows contain tiny top-bar icons, not full-size inventory
    # art. Keep the synthetic target small so the network learns the same
    # antialiased, low-detail silhouettes it will see in screenshots.
    target = rng.uniform(14, 38)
    scale = target / max(h, w) * rng.uniform(0.82, 1.18)
    new_w = max(6, int(w * scale))
    new_h = max(6, int(h * scale))
    icon = cv2.resize(bgr, (new_w, new_h), interpolation=cv2.INTER_AREA)
    mask = cv2.resize(alpha, (new_w, new_h), interpolation=cv2.INTER_AREA)

    angle = rng.uniform(-13, 13)
    rot_scale = rng.uniform(0.88, 1.12)
    matrix = cv2.getRotationMatrix2D((new_w / 2, new_h / 2), angle, rot_scale)
    icon = cv2.warpAffine(icon, matrix, (new_w, new_h), flags=cv2.INTER_LINEAR, borderValue=(0, 0, 0))
    mask = cv2.warpAffine(mask, matrix, (new_w, new_h), flags=cv2.INTER_LINEAR, borderValue=0)

    icon = np.clip(icon.astype(np.float32) * rng.uniform(0.70, 1.35) + rng.uniform(-20, 20), 0, 255).astype(np.uint8)
    if rng.random() < 0.35:
        icon = cv2.GaussianBlur(icon, (3, 3), rng.uniform(0.15, 0.9))
        mask = cv2.GaussianBlur(mask, (3, 3), 0)

    if centered:
        x = int(IMAGE_SIZE / 2 - new_w / 2 + rng.uniform(-12, 12))
        y = int(IMAGE_SIZE / 2 - new_h / 2 + rng.uniform(-12, 12))
    else:
        x = int(rng.uniform(-new_w * 0.65, IMAGE_SIZE - new_w * 0.35))
        y = int(rng.uniform(-new_h * 0.65, IMAGE_SIZE - new_h * 0.35))

    if partial:
        side = rng.choice(["left", "right", "top", "bottom"])
        if side == "left":
            x = int(rng.uniform(-new_w * 0.85, -new_w * 0.25))
        elif side == "right":
            x = int(rng.uniform(IMAGE_SIZE - new_w * 0.75, IMAGE_SIZE - new_w * 0.15))
        elif side == "top":
            y = int(rng.uniform(-new_h * 0.85, -new_h * 0.25))
        else:
            y = int(rng.uniform(IMAGE_SIZE - new_h * 0.75, IMAGE_SIZE - new_h * 0.15))

    x0 = max(0, x)
    y0 = max(0, y)
    x1 = min(IMAGE_SIZE, x + new_w)
    y1 = min(IMAGE_SIZE, y + new_h)
    if x0 >= x1 or y0 >= y1:
        return canvas

    ix0 = x0 - x
    iy0 = y0 - y
    ix1 = ix0 + (x1 - x0)
    iy1 = iy0 + (y1 - y0)
    alpha_f = (mask[iy0:iy1, ix0:ix1].astype(np.float32) / 255.0)[..., None]
    canvas[y0:y1, x0:x1] = (
        icon[iy0:iy1, ix0:ix1].astype(np.float32) * alpha_f
        + canvas[y0:y1, x0:x1].astype(np.float32) * (1 - alpha_f)
    ).astype(np.uint8)
    return canvas


def _postprocess(canvas: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    if rng.random() < 0.25:
        canvas = cv2.resize(canvas, (rng.integers(44, 76), rng.integers(44, 76)), interpolation=cv2.INTER_AREA)
        canvas = cv2.resize(canvas, (IMAGE_SIZE, IMAGE_SIZE), interpolation=cv2.INTER_AREA)
    if rng.random() < 0.20:
        ok, encoded = cv2.imencode(".jpg", canvas, [int(cv2.IMWRITE_JPEG_QUALITY), int(rng.integers(35, 92))])
        if ok:
            canvas = cv2.imdecode(encoded, cv2.IMREAD_COLOR)
    return canvas


class SyntheticWeaponDataset(Dataset[tuple[torch.Tensor, torch.Tensor]]):
    def __init__(
        self,
        templates: list[TemplateImage],
        labels: list[str],
        samples: int,
        seed: int,
        unknown_fraction: float = 0.16,
    ) -> None:
        self.templates = templates
        self.labels = labels
        self.label_to_index = {label: index for index, label in enumerate(labels)}
        self.samples = samples
        self.seed = seed
        self.unknown_fraction = unknown_fraction

    def __len__(self) -> int:
        return self.samples

    def __getitem__(self, index: int) -> tuple[torch.Tensor, torch.Tensor]:
        rng = np.random.default_rng(self.seed + index * 1009)
        canvas = _dark_canvas(rng)
        is_unknown = rng.random() < self.unknown_fraction
        if is_unknown:
            for _ in range(int(rng.integers(0, 3))):
                template = self.templates[int(rng.integers(0, len(self.templates)))]
                canvas = _paste_template(canvas, template, rng, centered=False, partial=True)
            if rng.random() < 0.45:
                cv2.line(
                    canvas,
                    (int(rng.integers(0, IMAGE_SIZE)), int(rng.integers(0, IMAGE_SIZE))),
                    (int(rng.integers(0, IMAGE_SIZE)), int(rng.integers(0, IMAGE_SIZE))),
                    (int(rng.integers(60, 190)), int(rng.integers(60, 190)), int(rng.integers(60, 190))),
                    int(rng.integers(1, 4)),
                )
            label = UNKNOWN_LABEL
        else:
            template = self.templates[int(rng.integers(0, len(self.templates)))]
            canvas = _paste_template(canvas, template, rng, centered=True, partial=False)
            label = template.info.weapon_id

        canvas = _postprocess(canvas, rng)
        rgb = cv2.cvtColor(canvas, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
        tensor = torch.from_numpy(rgb.transpose(2, 0, 1))
        return tensor, torch.tensor(self.label_to_index[label], dtype=torch.long)


def train(args: argparse.Namespace) -> None:
    random.seed(args.seed)
    np.random.seed(args.seed)
    torch.manual_seed(args.seed)
    torch.set_num_threads(max(1, args.threads))

    template_dir = Path(args.template_dir)
    catalog = load_weapon_catalog(template_dir)
    templates = [loaded for info in catalog if (loaded := _load_template_image(info)) is not None]
    if not templates:
        raise SystemExit(f"no templates loaded from {template_dir}")

    labels = sorted(template.info.weapon_id for template in templates) + [UNKNOWN_LABEL]
    dataset = SyntheticWeaponDataset(
        templates=templates,
        labels=labels,
        samples=args.samples,
        seed=args.seed,
        unknown_fraction=args.unknown_fraction,
    )
    loader = DataLoader(dataset, batch_size=args.batch_size, shuffle=True, num_workers=0)

    model = WeaponIconNet(len(labels))
    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-4)
    model.train()

    for epoch in range(1, args.epochs + 1):
        correct = 0
        total = 0
        loss_total = 0.0
        for images, targets in loader:
            logits = model(images)
            loss = F.cross_entropy(logits, targets)
            optimizer.zero_grad(set_to_none=True)
            loss.backward()
            optimizer.step()

            loss_total += float(loss.detach()) * int(images.shape[0])
            correct += int((logits.argmax(dim=1) == targets).sum())
            total += int(images.shape[0])

        print(
            f"epoch {epoch}/{args.epochs} loss={loss_total / max(1, total):.4f} "
            f"acc={correct / max(1, total):.4f}",
            flush=True,
        )

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    weights_path = output_dir / "weapon_icon_classifier.pt"
    onnx_path = output_dir / "weapon_icon_classifier.onnx"
    labels_path = output_dir / "weapon_icon_labels.json"

    torch.save({"state_dict": model.state_dict(), "labels": labels, "image_size": IMAGE_SIZE}, weights_path)
    labels_path.write_text(json.dumps({"labels": labels, "unknown": UNKNOWN_LABEL, "imageSize": IMAGE_SIZE}, ensure_ascii=False, indent=2), encoding="utf-8")

    model.eval()
    dummy = torch.zeros(1, 3, IMAGE_SIZE, IMAGE_SIZE, dtype=torch.float32)
    torch.onnx.export(
        model,
        dummy,
        onnx_path,
        input_names=["input"],
        output_names=["logits"],
        opset_version=17,
        dynamo=False,
        dynamic_axes={"input": {0: "batch"}, "logits": {0: "batch"}},
    )
    print(f"wrote {weights_path}")
    print(f"wrote {onnx_path}")
    print(f"wrote {labels_path}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--template-dir", default=str(ROOT / "assets" / "weapon_templates"))
    parser.add_argument("--output-dir", default=str(ROOT / "assets" / "models"))
    parser.add_argument("--epochs", type=int, default=8)
    parser.add_argument("--samples", type=int, default=18000)
    parser.add_argument("--batch-size", type=int, default=192)
    parser.add_argument("--lr", type=float, default=0.0015)
    parser.add_argument("--threads", type=int, default=4)
    parser.add_argument("--seed", type=int, default=20260522)
    parser.add_argument("--unknown-fraction", type=float, default=0.16)
    return parser.parse_args()


if __name__ == "__main__":
    train(parse_args())
