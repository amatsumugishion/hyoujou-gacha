"""
prompts.txt -> prompts.csv 変換
前提: prompts.txt は固定プロンプト（キャラ共通部分）が Ctrl+H で除去済みであること。
"""

import argparse
import csv
import json
import re
from pathlib import Path

SEPARATOR = "-" * 40
IMAGE_LINE_RE = re.compile(r"^\[image\]\s*(?P<file>.+?)\s*\([^()]*\)\s*$")

WEIGHT_PAREN_RE = re.compile(r"\(([^()]*):[\d.]+\)")
PLAIN_PAREN_RE = re.compile(r"\(([^()]*)\)")
BRACKET_RE = re.compile(r"\[([^\[\]]*)\]")


def parse_prompts_txt(path: Path) -> list[tuple[str, str]]:
    """prompts.txt を [(file, prompt_text), ...] にパースする"""
    text = path.read_text(encoding="utf-8")
    entries = []

    for block in text.split(SEPARATOR):
        block = block.strip()
        if not block:
            continue

        file_name = None
        prompt_lines: list[str] = []
        in_prompt = False

        for line in block.splitlines():
            if line.startswith("[image]"):
                m = IMAGE_LINE_RE.match(line.strip())
                file_name = m.group("file") if m else line[len("[image]"):].strip()
                in_prompt = False
            elif line.strip() == "[prompt]":
                in_prompt = True
            elif line.strip() == "[negative]":
                in_prompt = False
            elif in_prompt:
                prompt_lines.append(line)

        if file_name is None:
            continue

        # 1行目は固定プロンプト（キャラ共通部分）のため除去
        if prompt_lines:
            prompt_lines = prompt_lines[1:]

        entries.append((file_name, "\n".join(prompt_lines).strip()))

    return entries


ESCAPED_OPEN = "\x00ESC_OPEN\x00"
ESCAPED_CLOSE = "\x00ESC_CLOSE\x00"


def normalize_weights(prompt_text: str) -> str:
    """(tag:1.2) / (tag) / [tag] の強調構文を除去し、素のタグ文字列に戻す。
    \\( \\) はタグ自体が持つ literal な括弧（例: gloom \\(expression\\)）なので、
    強調構文と誤認しないよう一時退避してから処理する。"""
    text = prompt_text.replace("\\(", ESCAPED_OPEN).replace("\\)", ESCAPED_CLOSE)
    for pattern in (WEIGHT_PAREN_RE, PLAIN_PAREN_RE, BRACKET_RE):
        prev = None
        while prev != text:
            prev = text
            text = pattern.sub(r"\1", text)
    text = text.replace(ESCAPED_OPEN, "(").replace(ESCAPED_CLOSE, ")")
    return text


def split_tags(prompt_text: str) -> list[str]:
    normalized = normalize_weights(prompt_text)
    return [t.strip() for t in normalized.split(",") if t.strip()]


def load_category_rules(path: Path) -> dict[str, list[str]]:
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


FALLBACK_CATEGORY = "無所属"


def match_categories(tags: list[str], rules: dict[str, list[str]]) -> list[str]:
    tag_set = set(tags)
    matched = []
    for category, keywords in rules.items():
        if tag_set & set(keywords):
            matched.append(category)
    if not matched:
        matched.append(FALLBACK_CATEGORY)
    return matched


FIELDNAMES = ["id", "file", "tags", "categories", "intensity", "note"]


def load_existing_rows(output_csv: Path) -> list[dict]:
    """既存のprompts.csvを読み込む（人間の手修正を保持するため）"""
    if not output_csv.exists():
        return []
    with output_csv.open("r", encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def build_rows(prompts_txt: Path, category_rules: Path, existing_rows: list[dict]) -> tuple[list[dict], list[str]]:
    """
    既存行はそのまま保持し、prompts.txtにあって既存CSVにまだ無いfileだけ新規追加する。
    戻り値: (全行, 新規追加されたfile名のリスト)
    """
    entries = parse_prompts_txt(prompts_txt)
    rules = load_category_rules(category_rules)

    known_files = {row["file"] for row in existing_rows}
    next_id = max((int(row["id"]) for row in existing_rows), default=0) + 1

    rows = list(existing_rows)
    added = []

    for file_name, prompt_text in entries:
        if file_name in known_files:
            continue
        tags = split_tags(prompt_text)
        categories = match_categories(tags, rules)
        rows.append({
            "id": next_id,
            "file": file_name,
            "tags": "|".join(tags),
            "categories": "|".join(categories),
            "intensity": "",
            "note": "",
        })
        added.append(file_name)
        next_id += 1

    return rows, added


def write_csv(rows: list[dict], output_csv: Path) -> None:
    output_csv.parent.mkdir(parents=True, exist_ok=True)
    with output_csv.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDNAMES)
        writer.writeheader()
        writer.writerows(rows)


def main():
    parser = argparse.ArgumentParser(
        description="prompts.txt -> prompts.csv 変換（既存行は保持し、新規fileだけ追記する）"
    )
    parser.add_argument("--prompts", default=str(Path(__file__).resolve().parent.parent / "docs" / "data" / "prompts.txt"))
    parser.add_argument("--rules", default=str(Path(__file__).resolve().parent.parent / "docs" / "data" / "category_rules.json"))
    parser.add_argument("--out", default=str(Path(__file__).resolve().parent.parent / "docs" / "data" / "prompts.csv"))
    args = parser.parse_args()

    prompts_path = Path(args.prompts)
    rules_path = Path(args.rules)
    out_path = Path(args.out)

    if not prompts_path.exists():
        print(f"[ERROR] {prompts_path} が見つかりません。")
        return

    existing_rows = load_existing_rows(out_path)
    rows, added = build_rows(prompts_path, rules_path, existing_rows)
    write_csv(rows, out_path)

    print(f"[INFO] 合計{len(rows)}件（新規追加{len(added)}件）を {out_path} に出力しました。")

    added_set = set(added)
    no_match = [r["file"] for r in rows if r["file"] in added_set and not r["categories"]]
    if no_match:
        print(f"[WARN] カテゴリ未マッチ（新規分）: {len(no_match)}件")
        for f in no_match:
            print(f"   - {f}")


if __name__ == "__main__":
    main()
