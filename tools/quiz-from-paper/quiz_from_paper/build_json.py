"""Turn a Paper into a LongQuiz JSON object. Paper-faithful: no invented synonyms."""

from __future__ import annotations

import re
from typing import Any

from .docx_extract import Paper, PaperItem
from .ids import infer_quiz_id, infer_source_label
from .points import parse_model_points, strip_scores
from .slash import expand_slash

COL_KEYS = {
    "引文": "quote",
    "原文": "quote",
    "解釋": "explain",
    "景色": "view",
    "修辭": "device",
    "修辭手法": "device",
    "手法": "device",
    "答案": "answer",
}

DEFAULT_GLOSS_PROMPT = "試解釋以下文句中粗體字的意思。"
DEFAULT_YI_PROMPT = "試把以下句子譯為語體文。"


def build_quiz(paper: Paper, quiz_id: str | None = None) -> tuple[dict[str, Any], list[str]]:
    qid = infer_quiz_id(paper.meta.title, quiz_id)
    label = infer_source_label(paper.meta.title)
    review: list[str] = []
    items: list[dict[str, Any]] = []
    for raw in paper.items:
        item, flags = _build_item(raw, label)
        items.append(item)
        for flag in raw.flags + flags:
            review.append(f"{_qno(raw)}：{flag}")

    sum_max = sum(int(it.get("max") or 0) for it in items)
    total = paper.meta.totalMax
    quiz = {
        "id": qid,
        "title": paper.meta.title or qid,
        "source": paper.meta.source_path,
        "designer": paper.meta.designer,
        "totalMax": total if total is not None else sum_max,
        "timeLimitMin": paper.meta.timeLimitMin,
        "typoPenalty": {
            "enabled": False,
            "note": "沿用現組長答卷：電子版不做錯別字扣分。",
        },
        "shuffle": "none",
        "notes": [
            "由此轉換腳本按原卷教師本產出；只拆卷面「／」與「（n分）」，不自行發明同義接受項。",
            "accept1／accept05 僅在中間 md 有寫時才填；否則留空，交人手核對。",
            "長答卷判分以點為單位全有或全無；腳本未使用 accept05，除非 md 明示。",
        ],
        "items": items,
    }
    # drop null designer/source if empty
    if not quiz["designer"]:
        quiz.pop("designer")
    if not quiz["source"]:
        quiz.pop("source")

    if total is not None and sum_max != total:
        review.insert(
            0,
            f"【分數不合】各題滿分合計 {sum_max}，卷首總分 {total}。須人手核對是否漏拆分點或漏題。",
        )
    else:
        review.insert(0, f"各題滿分合計 {sum_max}，與卷首總分 {total if total is not None else sum_max} 相符。")

    for sec, expected in paper.section_max.items():
        got = sum(int(it["max"]) for it, raw in zip(items, paper.items) if raw.section == sec)
        n = sum(1 for raw in paper.items if raw.section == sec)
        if got != expected:
            review.append(f"【分數不合】{sec}部卷首標 {expected} 分，腳本合計 {got} 分（{n} 題）。")
        else:
            review.append(f"{sec}部：{n} 題、{got} 分，與卷首標分相符。")
    return quiz, review


def _qno(item: PaperItem) -> str:
    return f"{item.section}{item.number}"


def _build_item(raw: PaperItem, source_label: str | None) -> tuple[dict[str, Any], list[str]]:
    flags: list[str] = []
    qno = _qno(raw)
    if raw.type == "gloss":
        answers = expand_slash(raw.answers_raw)
        accept1 = expand_slash(raw.accept1_raw)
        accept05 = expand_slash(raw.accept05_raw)
        if not answers:
            flags.append("甲部答案為空")
        item = {
            "id": _id_for(raw),
            "qNo": qno,
            "type": "gloss",
            "max": raw.max or 1,
            "stem": raw.stem,
            "target": raw.target,
            "prompt": raw.prompt or DEFAULT_GLOSS_PROMPT,
            "answers": answers,
            "accept1": accept1,
            "accept05": accept05,
        }
        if source_label:
            item["sourceLabel"] = source_label
        return item, flags

    if raw.type == "sentence_translate":
        parsed = parse_model_points(raw.model_raw, id_prefix="p")
        flags.extend(parsed.flags)
        for p in parsed.points:
            flags.extend(p.flags)
        if parsed.points and raw.max and sum(p.max for p in parsed.points) != raw.max:
            flags.append(
                f"題幹標 {raw.max} 分，但拆出的分點合計 {sum(p.max for p in parsed.points)} 分"
            )
        item = {
            "id": _id_for(raw),
            "qNo": qno,
            "type": "sentence_translate",
            "max": raw.max or sum(p.max for p in parsed.points),
            "prompt": raw.prompt or DEFAULT_YI_PROMPT,
            "source": raw.source_text,
            "modelAnswer": parsed.model_answer,
            "points": [_point_dict(p) for p in parsed.points],
        }
        if source_label:
            item["sourceLabel"] = source_label
        return item, flags

    if raw.type == "long_points":
        parsed = parse_model_points(raw.model_raw, id_prefix="p")
        flags.extend(parsed.flags)
        for p in parsed.points:
            flags.extend(p.flags)
        got = sum(p.max for p in parsed.points)
        if parsed.points and raw.max and got != raw.max:
            flags.append(f"題幹標 {raw.max} 分，但拆出的分點合計 {got} 分")
        item = {
            "id": _id_for(raw),
            "qNo": qno,
            "type": "long_points",
            "max": raw.max or got,
            "prompt": raw.prompt,
            "modelAnswer": parsed.model_answer,
            "points": [_point_dict(p) for p in parsed.points],
        }
        return item, flags

    if raw.type == "kara_table":
        return _build_kara(raw, flags)

    flags.append(f"未支援的題型 {raw.type}，已原樣跳過結構")
    return {
        "id": _id_for(raw),
        "qNo": qno,
        "type": raw.type,
        "max": raw.max,
        "prompt": raw.prompt,
    }, flags


def _build_kara(raw: PaperItem, flags: list[str]) -> tuple[dict[str, Any], list[str]]:
    headers = raw.columns
    if not headers:
        flags.append("表格沒有欄名")
    person_col = headers[0] if headers else ""
    answer_set = set(raw.answer_columns)
    given_set = set(raw.given_columns)
    rows_out: list[dict[str, Any]] = []
    awarded = 0
    for r_i, row in enumerate(raw.rows, 1):
        person = row[0].strip() if row else f"第{r_i}行"
        cells_out: list[dict[str, Any]] = []
        for c_i, name in enumerate(headers[1:], start=1):
            val = row[c_i].strip() if c_i < len(row) else ""
            is_answer = name in answer_set or (name not in given_set and c_i == len(headers) - 1)
            if not is_answer:
                cells_out.append(
                    {
                        "key": COL_KEYS.get(name, _slug_key(name)),
                        "label": name,
                        "given": True,
                        "text": val,
                    }
                )
                continue
            from .points import SCORE_RE

            cell: dict[str, Any] = {
                "key": COL_KEYS.get(name, _slug_key(name)),
                "label": name,
                "given": False,
            }
            has_score = bool(SCORE_RE.search(val))
            parsed = parse_model_points(val, id_prefix=f"r{r_i}p") if has_score else None
            short_fill = _is_short_cell(val, parsed)
            if parsed and not short_fill and any(p.max for p in parsed.points):
                flags.extend(f"第{r_i}行「{name}」：{f}" for f in parsed.flags)
                cell["max"] = sum(p.max for p in parsed.points)
                cell["modelAnswer"] = parsed.model_answer
                cell["points"] = [_point_dict(p) for p in parsed.points]
            else:
                # 默寫原句、修辭名稱等短填充：用 answers／accept1，不用分點。
                if parsed:
                    answers = list(parsed.points[0].accept) if parsed.points else expand_slash(strip_scores(val) or val)
                else:
                    answers = expand_slash(strip_scores(val) or val)
                cell["max"] = (parsed.points[0].max if parsed and parsed.points and parsed.points[0].max else 1)
                cell["answers"] = answers
                cell["accept1"] = []
                cell["modelAnswer"] = strip_scores(val) or (answers[0] if answers else val)
                if "\n" in val or (_two_sentences(val)):
                    flags.append(
                        f"第{r_i}行「{name}」同一格含超過一句，只寫其中一句是否給分，須人手核對"
                    )
            awarded += int(cell["max"])
            cells_out.append(cell)
        rows_out.append({"person": person, "cells": cells_out})
        # person column is the row key; if person_col is also an answer (unusual), already handled

    max_ = raw.max or awarded
    if raw.max and awarded and awarded != raw.max:
        # 丙3: cells default to 1 each, should match 3. If teacher put no scores, awarded==rows
        if awarded != raw.max:
            flags.append(f"題幹標 {raw.max} 分，表格拆出 {awarded} 分")
    item = {
        "id": _id_for(raw),
        "qNo": _qno(raw),
        "type": "kara_table",
        "max": max_,
        "prompt": raw.prompt,
        "columns": headers,
        "rows": rows_out,
    }
    return item, flags



def _is_short_cell(val: str, parsed) -> bool:
    body = strip_scores(val).strip()
    if parsed and parsed.points and len(parsed.points) == 1 and len(body) <= 12:
        return True
    return False


def _two_sentences(text: str) -> bool:
    return len(re.findall(r"[。．]", text)) >= 1 and len(re.split(r"[。．]", text.strip("。．"))) >= 2 or text.count("，") >= 3


def _point_dict(p) -> dict[str, Any]:
    d: dict[str, Any] = {
        "id": p.id,
        "max": p.max,
        "desc": p.desc,
        "accept": p.accept,
    }
    return d


def _id_for(raw: PaperItem) -> str:
    prefix = {"甲": "a", "乙": "b", "丙": "c", "丁": "d", "戊": "e"}.get(raw.section, raw.section.lower())
    return f"{prefix}{raw.number}"


def _slug_key(name: str) -> str:
    return re.sub(r"\W+", "_", name).strip("_") or "cell"
