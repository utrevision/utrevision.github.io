"""CLI: convert a docx or intermediate md into LongQuiz JSON, and optionally diff a hand draft."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from .build_json import build_quiz
from .diff_quiz import diff_quizzes, load as load_json
from .docx_extract import extract_docx
from .ids import infer_quiz_id
from .md_io import load_md, paper_to_md
from .review import compare_existing_bank, write_review


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="把溫習小測教師本（docx 或中間 md）轉成 utrevision 長答題庫 JSON。"
    )
    sub = parser.add_subparsers(dest="cmd", required=True)

    conv = sub.add_parser("convert", help="docx 或 md → 中間 md＋題庫 JSON＋核對報告")
    conv.add_argument("--input", required=True, help="教師本 .docx，或已轉錄的中間 .md")
    conv.add_argument("--id", dest="quiz_id", default=None, help="題庫 id，例如 shide-xishan")
    conv.add_argument("--out-dir", required=True, help="輸出目錄")
    conv.add_argument(
        "--bank",
        default=None,
        help="可選：現有甲部題庫 JSON（例如 8passages.json），用來標出同句衝突",
    )
    conv.add_argument(
        "--compare",
        default=None,
        help="可選：人手整理的題庫 JSON，輸出差異報告",
    )

    d = sub.add_parser("diff", help="比較兩份題庫 JSON")
    d.add_argument("--script", required=True)
    d.add_argument("--ref", required=True)
    d.add_argument("--out", required=True)
    args = parser.parse_args(argv)

    if args.cmd == "diff":
        text = diff_quizzes(load_json(args.script), load_json(args.ref))
        Path(args.out).write_text(text, encoding="utf-8")
        print(args.out)
        return 0

    return _convert(args)


def _convert(args: argparse.Namespace) -> int:
    src = Path(args.input)
    if not src.exists():
        raise SystemExit(f"找不到輸入檔：{src}")
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    suffix = src.suffix.lower()
    if suffix == ".docx":
        paper = extract_docx(str(src))
        quiz_id = infer_quiz_id(paper.meta.title, args.quiz_id)
        md_text = paper_to_md(paper, quiz_id)
        md_path = out_dir / f"{quiz_id}.md"
        md_path.write_text(md_text, encoding="utf-8")
        # re-parse the md so docx and md paths share one builder
        from .md_io import md_to_paper

        paper, quiz_id = md_to_paper(md_text, source_path=str(src))
    elif suffix in {".md", ".markdown"}:
        paper, quiz_id = load_md(str(src))
        if args.quiz_id:
            quiz_id = args.quiz_id
        md_path = out_dir / f"{quiz_id}.md"
        if src.resolve() != md_path.resolve():
            md_path.write_text(src.read_text(encoding="utf-8"), encoding="utf-8")
    else:
        raise SystemExit("輸入須為 .docx 或 .md")

    quiz, flags = build_quiz(paper, quiz_id)
    bank_hits = compare_existing_bank(quiz, args.bank)
    json_path = out_dir / f"{quiz_id}.json"
    json_path.write_text(json.dumps(quiz, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    review_path = out_dir / f"{quiz_id}.review.md"
    write_review(review_path, quiz, flags, bank_hits)

    diff_path = None
    if args.compare:
        diff_path = out_dir / f"{quiz_id}.diff.md"
        diff_path.write_text(diff_quizzes(quiz, load_json(args.compare)), encoding="utf-8")

    n = len(quiz["items"])
    total = quiz["totalMax"]
    summed = sum(it["max"] for it in quiz["items"])
    print(f"id={quiz_id}")
    print(f"items={n} sum_max={summed} totalMax={total}")
    print(f"md={md_path}")
    print(f"json={json_path}")
    print(f"review={review_path}")
    if diff_path:
        print(f"diff={diff_path}")
    return 0 if summed == (total or summed) else 1
