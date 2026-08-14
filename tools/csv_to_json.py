"""
prompts.csv -> prompts.json 変換
Excelでの手修正（categories/intensity/note）を終えた後、サイト公開前に実行する。
"""

import argparse
import csv
import json
from pathlib import Path


def csv_to_records(csv_path: Path) -> list[dict]:
    with csv_path.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        records = []
        for row in reader:
            records.append({
                "id": int(row["id"]),
                "file": row["file"],
                "tags": [t for t in row["tags"].split("|") if t],
                "categories": [c for c in row["categories"].split("|") if c],
                "intensity": int(row["intensity"]) if row["intensity"].strip() else None,
                "note": row["note"],
            })
        return records


def main():
    parser = argparse.ArgumentParser(description="prompts.csv -> prompts.json 変換")
    parser.add_argument("--csv", default=str(Path(__file__).resolve().parent.parent / "docs" / "data" / "prompts.csv"))
    parser.add_argument("--out", default=str(Path(__file__).resolve().parent.parent / "docs" / "data" / "prompts.json"))
    args = parser.parse_args()

    csv_path = Path(args.csv)
    out_path = Path(args.out)

    if not csv_path.exists():
        print(f"[ERROR] {csv_path} が見つかりません。")
        return

    records = csv_to_records(csv_path)
    out_path.write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[INFO] {len(records)}件を {out_path} に出力しました。")


if __name__ == "__main__":
    main()
