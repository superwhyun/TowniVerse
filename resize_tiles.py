#!/usr/bin/env python3
"""Resize PNG tile images to the TowniVerse isometric tile spec.

By default the script scans the `tiles/` directory and rescales every PNG so the
width becomes 256px while the aspect ratio is preserved.  Pass one or more files
or directories to override the default search scope.  Use `--target-height` to
force a specific height (otherwise heights are derived from the aspect ratio).

Example usages:
  python resize_tiles.py                        # resize all PNGs under tiles/
  python resize_tiles.py tiles/house.png        # resize a single asset
  python resize_tiles.py tiles --target-height 384
"""
from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path

try:  # Pillow is preferred for cross-platform resizing
    from PIL import Image  # type: ignore
except ImportError:  # pragma: no cover
    Image = None  # Fallback to platform tools (sips)

DEFAULT_DIR = Path("tiles")
DEFAULT_WIDTH = 256


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "paths",
        nargs="*",
        type=Path,
        help="Files or directories to process (defaults to ./tiles)",
    )
    parser.add_argument(
        "--target-width",
        type=int,
        default=DEFAULT_WIDTH,
        metavar="PX",
        help="Desired width in pixels (default: %(default)s)",
    )
    parser.add_argument(
        "--target-height",
        type=int,
        default=None,
        metavar="PX",
        help="Optional explicit height. If omitted, height preserves the original aspect ratio.",
    )
    parser.add_argument(
        "--suffix",
        default="_tile",
        help="Suffix for resized copies when not doing in-place updates (default: %(default)s)",
    )
    parser.add_argument(
        "--in-place",
        action="store_true",
        help="Overwrite source files instead of writing suffixed copies.",
    )
    return parser.parse_args()


def iter_pngs(paths: list[Path]) -> list[Path]:
    if not paths:
        paths = [DEFAULT_DIR]
    resolved = []
    for path in paths:
        if not path.exists():
            print(f"[skip] {path} does not exist", file=sys.stderr)
            continue
        if path.is_dir():
            resolved.extend(sorted(path.rglob("*.png")))
        else:
            if path.suffix.lower() == ".png":
                resolved.append(path)
            else:
                print(f"[skip] {path} is not a PNG", file=sys.stderr)
    return resolved


def get_image_size(path: Path) -> tuple[int, int]:
    if Image is not None:
        with Image.open(path) as img:
            return img.width, img.height
    result = subprocess.run(
        ["sips", "-g", "pixelWidth", "-g", "pixelHeight", str(path)],
        capture_output=True,
        text=True,
        check=True,
    )
    width = height = None
    for line in result.stdout.splitlines():
        if "pixelWidth" in line:
            width = int(line.split(":")[-1].strip())
        elif "pixelHeight" in line:
            height = int(line.split(":")[-1].strip())
    if width is None or height is None:
        raise RuntimeError(f"Unable to determine size for {path}")
    return width, height


def resize_image(path: Path, width: int, height: int | None, inplace: bool, suffix: str) -> None:
    orig_w, orig_h = get_image_size(path)
    target_w = width if width else orig_w
    if target_w <= 0:
        raise ValueError("target width must be positive")
    if height:
        target_h = height
    else:
        ratio = target_w / orig_w
        target_h = max(1, round(orig_h * ratio))

    if orig_w == target_w and orig_h == target_h:
        print(f"[skip] {path} already {target_w}x{target_h}")
        return

    if Image is not None:
        with Image.open(path) as img:
            resized = img.resize((target_w, target_h), Image.LANCZOS)
            if inplace:
                out_path = path
            else:
                out_path = path.with_name(path.stem + suffix + path.suffix)
            resized.save(out_path)
    else:
        if inplace:
            out_path = path
        else:
            out_path = path.with_name(path.stem + suffix + path.suffix)
            shutil.copy2(path, out_path)
        if height:
            cmd = ["sips", "-z", str(target_h), str(target_w), str(out_path)]
        else:
            cmd = ["sips", "-Z", str(target_w), str(out_path)]
        subprocess.run(cmd, check=True)

    print(f"[write] {path.name} -> {out_path.name} ({target_w}x{target_h})")


def main() -> None:
    args = parse_args()
    pngs = iter_pngs(args.paths)
    if not pngs:
        print("No PNG files found to resize.")
        return
    for png in pngs:
        resize_image(png, args.target_width, args.target_height, args.in_place, args.suffix)


if __name__ == "__main__":
    main()
