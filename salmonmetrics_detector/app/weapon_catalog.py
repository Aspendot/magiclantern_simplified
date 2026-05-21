from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class WeaponTemplateInfo:
    weapon_id: str
    name_ja: str
    name_en: str
    aliases: tuple[str, ...]
    path: Path


def load_weapon_catalog(assets_dir: Path) -> list[WeaponTemplateInfo]:
    manifest_path = assets_dir / "manifest.json"
    if not manifest_path.exists():
        return []

    data = json.loads(manifest_path.read_text(encoding="utf-8"))
    weapons: list[WeaponTemplateInfo] = []
    for item in data.get("weapons", []):
        key = str(item.get("key") or "").strip()
        if not key:
            continue

        icon_value = str(item.get("icon") or "").strip()
        icon_name = Path(icon_value).name if icon_value else f"{key}.png"
        icon_path = assets_dir / icon_name
        if not icon_path.exists():
            icon_path = assets_dir / f"{key}.png"
        if not icon_path.exists():
            continue

        aliases = tuple(str(alias) for alias in item.get("aliases", []) if str(alias).strip())
        weapons.append(
            WeaponTemplateInfo(
                weapon_id=key,
                name_ja=str(item.get("nameJa") or key),
                name_en=str(item.get("nameEn") or key),
                aliases=aliases,
                path=icon_path,
            )
        )
    return weapons

