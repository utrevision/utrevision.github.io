"""Build a human review report, including clashes with an existing gloss bank."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any


def write_review(
    path: Path,
    quiz: dict[str, Any],
    flags: list[str],
    bank_hits: list[str],
) -> None:
    lines = [
        f"# 轉換核對報告：{quiz.get('title') or quiz.get('id')}",
        "",
        f"- 題庫 id：`{quiz.get('id')}`",
        f"- 題數：{len(quiz.get('items') or [])}",
        f"- 卷首／稿內總分：{quiz.get('totalMax')}",
        f"- 限時：{quiz.get('timeLimitMin')} 分鐘" if quiz.get("timeLimitMin") else "- 限時：未標",
        f"- 設計老師：{quiz.get('designer') or '未標'}",
        "",
        "## 腳本自動檢查",
        "",
    ]
    for flag in flags:
        lines.append(f"- {flag}")
    if bank_hits:
        lines += ["", "## 與現有甲部題庫（同一原句＋考核字）的差異", ""]
        lines += [f"- {h}" for h in bank_hits]
        lines.append("")
        lines.append("腳本不會擅自改對齊現有題庫；是否改從現站，須人手決定。")
    lines += [
        "",
        "## 必須人手核對（每次轉換都要看）",
        "",
        "- 題數、各部及各題分數是否與原卷相符。",
        "- 「／」是「或」（拆成多個滿分答案）還是同一點裡要同時出現的兩邊。",
        "- 長答分點是否切對；有沒有把「襯托出……」誤切成兩截。",
        "- 表內哪一欄已給、哪一欄要學生填。",
        "- accept1／accept05：腳本只在中間 md 有寫時才填，其餘留空，不要把同義詞或現站舊答自動寫進去。",
        "- 原卷用字（例如溪／谿）須保留，不要自行統一。",
        "- 此腳本不掛首頁、不改 Firestore、不部署。",
        "",
    ]
    path.write_text("\n".join(lines), encoding="utf-8")


def compare_existing_bank(quiz: dict[str, Any], bank_path: str | None) -> list[str]:
    if not bank_path:
        return []
    p = Path(bank_path)
    if not p.exists():
        return [f"找不到對照題庫：{bank_path}"]
    data = json.loads(p.read_text(encoding="utf-8"))
    bank_items = data.get("items") or data
    index: dict[tuple[str, str], dict] = {}
    for it in bank_items:
        stem = (it.get("stem") or "").strip()
        target = (it.get("target") or "").strip()
        if stem and target:
            index[(stem, target)] = it
    hits = []
    for it in quiz.get("items") or []:
        if it.get("type") != "gloss":
            continue
        key = ((it.get("stem") or "").strip(), (it.get("target") or "").strip())
        old = index.get(key)
        if not old:
            continue
        same = [str(x).strip() for x in (it.get("answers") or [])] == [
            str(x).strip() for x in (old.get("answers") or [])
        ]
        if same:
            continue
        hits.append(
            f"{it.get('qNo')}「{key[0]}」{key[1]}：本稿 answers={it.get('answers')}；"
            f"現庫 answers={old.get('answers')} accept1={old.get('accept1')} accept05={old.get('accept05')}"
        )
    return hits
