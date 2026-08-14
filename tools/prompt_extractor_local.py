"""
prompt_extractor_local.py
SD生成PNGからprompt / negative prompt / サイズを抽出して1つのtxtにまとめる
★ WebUI不要版: PILでPNGメタデータを直接読み取る
"""

import argparse
import re
import sys
import traceback
from pathlib import Path
from PIL import Image

OUTPUT_FILE = "prompts.txt"
SEPARATOR = "-" * 40


def get_png_info_local(image_path: Path) -> str:
    """
    PILでPNGのtEXtチャンクを読み取り、SD用パラメータ文字列を返す。
    A1111 / ForgeNeo 両対応（どちらも 'parameters' キーに格納）
    """
    with Image.open(image_path) as img:
        info = img.info  # tEXtチャンク全体が dict で取れる
        return info.get("parameters", "")


def parse_size(image_path: Path) -> str:
    """画像ファイルから実サイズを取得する（メタデータ記載が無くても確実）"""
    with Image.open(image_path) as img:
        w, h = img.size
        return f"{w}x{h}"


def parse_prompts(info: str) -> tuple[str, str]:
    """
    parametersテキストからpromptとnegative promptを分離して返す
    戻り値: (prompt, negative_prompt)
    """
    if not info.strip():
        return "<NO PROMPT FOUND>", "<NO NEGATIVE PROMPT FOUND>"

    neg_marker = "Negative prompt:"
    step_markers = ["Steps:", "Sampler:", "CFG scale:"]

    def cut_at_steps(text: str) -> str:
        pos = len(text)
        for marker in step_markers:
            idx = text.find(marker)
            if idx != -1:
                pos = min(pos, idx)
        return text[:pos].strip()

    neg_idx = info.find(neg_marker)

    if neg_idx != -1:
        prompt = info[:neg_idx].strip()
        after_neg = info[neg_idx + len(neg_marker):].strip()
        negative_prompt = cut_at_steps(after_neg) or "<NO NEGATIVE PROMPT FOUND>"
    else:
        prompt = cut_at_steps(info)
        negative_prompt = "<NO NEGATIVE PROMPT FOUND>"

    return prompt or "<NO PROMPT FOUND>", negative_prompt


def select_mode() -> int:
    """出力モードを選択する（1: promptのみ / 2: prompt + negative）"""
    print("=" * 40)
    print("  出力モードを選択してください")
    print("  1: prompt のみ")
    print("  2: prompt + negative prompt")
    print("=" * 40)
    while True:
        choice = input("選択 (1 or 2): ").strip()
        if choice in ("1", "2"):
            return int(choice)
        print("1 か 2 を入力してください。")


def main():
    parser = argparse.ArgumentParser(description="SD生成PNGからprompt抽出")
    parser.add_argument("--mode", type=int, choices=(1, 2), default=None,
                         help="1: prompt のみ / 2: prompt + negative prompt（省略時は対話入力）")
    parser.add_argument("--folder", type=str, default=None,
                         help="対象フォルダのパス（省略時は対話入力）")
    args = parser.parse_args()

    mode = args.mode if args.mode is not None else select_mode()
    mode_label = "prompt のみ" if mode == 1 else "prompt + negative prompt"
    print(f"\n[INFO] モード: {mode_label}")
    print("[INFO] WebUI不要モード（PILで直接読み取り）\n")

    if args.folder is not None:
        raw = args.folder.strip().strip('"')
    else:
        raw = input("対象フォルダのパスを入力してください: ").strip().strip('"')
    input_folder = Path(raw)

    if not input_folder.is_dir():
        print(f"[ERROR] フォルダが見つかりません: {input_folder}")
        return

    png_files = sorted(input_folder.glob("*.png"))

    if not png_files:
        print("[INFO] PNGファイルが見つかりませんでした。")
        return

    print(f"[INFO] {len(png_files)}枚のPNGを処理します...\n")

    output_path = input_folder / OUTPUT_FILE
    error_count = 0
    no_meta_count = 0

    with output_path.open("w", encoding="utf-8") as out:
        for image_path in png_files:
            print(f"処理中: {image_path.name}")

            try:
                raw_info = get_png_info_local(image_path)
                size = parse_size(image_path)

                if not raw_info:
                    # SDで生成されていないPNG（スクショ等）はメタデータなし
                    no_meta_count += 1
                    prompt = "<NO SD METADATA>"
                    negative_prompt = "<NO SD METADATA>"
                else:
                    prompt, negative_prompt = parse_prompts(raw_info)

                failed = False

            except Exception as e:
                prompt = f"<ERROR: {e}>"
                negative_prompt = f"<ERROR: {e}>"
                size = "<ERROR>"
                failed = True
                error_count += 1

            out.write(f"[image] {image_path.name}  ({size})\n")
            out.write(f"[prompt]\n{prompt}\n")

            if mode == 2:
                out.write(f"\n[negative]\n{negative_prompt}\n")

            out.write(f"\n{SEPARATOR}\n\n")
            out.flush()

    print(f"\n[OK] 完了: {output_path}")
    if no_meta_count:
        print(f"[INFO] {no_meta_count}枚にSDメタデータがありませんでした（スクショ等）。")
    if error_count:
        print(f"[WARN] {error_count}枚でエラーが発生しました。{OUTPUT_FILE} を確認してください。")


def pause_exit() -> None:
    try:
        input("\nEnterキーを押すと終了します...")
    except EOFError:
        pass


if __name__ == "__main__":
    try:
        main()
    except Exception:
        print("エラーが発生しました。\n")
        traceback.print_exc()
        pause_exit()
        sys.exit(1)
    else:
        pause_exit()
