"""
docs/img/full/*.png -> docs/img/thumb/*.jpg のサムネイルを生成する
一覧・お気に入り画面の通信量削減のため（既に生成済み・元画像より新しくないものはスキップ）
"""

from pathlib import Path
from PIL import Image

SRC_DIR = Path(__file__).resolve().parent.parent / "docs" / "img" / "full"
DST_DIR = Path(__file__).resolve().parent.parent / "docs" / "img" / "thumb"
MAX_SIZE = 320
QUALITY = 82


def main():
    DST_DIR.mkdir(parents=True, exist_ok=True)
    png_files = sorted(SRC_DIR.glob("*.png"))

    created = 0
    skipped = 0

    for src in png_files:
        dst = DST_DIR / (src.stem + ".jpg")
        if dst.exists() and dst.stat().st_mtime >= src.stat().st_mtime:
            skipped += 1
            continue

        with Image.open(src) as img:
            img = img.convert("RGB")
            img.thumbnail((MAX_SIZE, MAX_SIZE))
            img.save(dst, "JPEG", quality=QUALITY)
        created += 1

    print(f"[INFO] 生成{created}件 / スキップ{skipped}件 -> {DST_DIR}")


if __name__ == "__main__":
    main()
