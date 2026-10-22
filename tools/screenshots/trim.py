#!/usr/bin/env python3
"""trim.py — обрезает пустой фон по краям скриншотов docs/screenshots/.raw/*
и кладёт результат рядом (docs/screenshots/*.png)."""
import sys
from pathlib import Path

from PIL import Image, ImageChops

PAD = 28  # отступ от контента, px


def trim(src: Path, dst: Path) -> None:
    im = Image.open(src).convert("RGB")
    bg = Image.new("RGB", im.size, (10, 13, 19))  # #0a0d13
    diff = ImageChops.difference(im, bg)
    bbox = diff.getbbox()
    if bbox is None:
        im.save(dst)
        return
    left = max(0, bbox[0] - PAD)
    top = max(0, bbox[1] - PAD)
    right = min(im.width, bbox[2] + PAD)
    bottom = min(im.height, bbox[3] + PAD)
    # не шире 1600 и не обрезаем по ширине, если контент во всю ширину
    im.crop((0 if left < 60 else left, top, min(right, 1600), bottom)).save(dst)


def main() -> None:
    out = Path(sys.argv[1])
    for raw in sorted((out / ".raw").glob("*.png")):
        trim(raw, out / raw.name)
        print(f"  {raw.name} обрезан")


if __name__ == "__main__":
    main()
