"""Parse teacher-answer text that marks points with （n分） or （各n分）."""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from .slash import expand_slash

SCORE_RE = re.compile(r"（\s*(\d+)\s*分\s*）")
EACH_RE = re.compile(r"（\s*各\s*(\d+)\s*分\s*）")
LIST_SPLIT_RE = re.compile(r"[、，,]+")
AND_HINT_RE = re.compile(r"有的.+，有的|既.+又|一面.+一面|又.+又")


@dataclass
class ParsedPoint:
    id: str
    max: int
    desc: str
    accept: list[str]
    flags: list[str] = field(default_factory=list)


@dataclass
class ParsedModel:
    model_answer: str
    points: list[ParsedPoint]
    flags: list[str] = field(default_factory=list)


def strip_scores(text: str) -> str:
    text = EACH_RE.sub("", text)
    text = SCORE_RE.sub("", text)
    return re.sub(r"[ \t]+", " ", text).strip()


def parse_model_points(model: str, id_prefix: str = "p") -> ParsedModel:
    text = (model or "").strip()
    flags: list[str] = []
    if not text:
        return ParsedModel(model_answer="", points=[], flags=["標準答空白"])

    each = EACH_RE.search(text)
    if each:
        each_max = int(each.group(1))
        body = EACH_RE.sub("", text).strip().strip("。．.；;")
        parts = [p.strip() for p in LIST_SPLIT_RE.split(body) if p.strip()]
        points = []
        for i, part in enumerate(parts, 1):
            accept = expand_slash(part)
            points.append(
                ParsedPoint(
                    id=f"{id_prefix}{i}",
                    max=each_max,
                    desc=part,
                    accept=accept or [part],
                )
            )
        if len(parts) < 2:
            flags.append("標了「各n分」但未能拆成多點，須人手核對")
        return ParsedModel(model_answer=strip_scores(text), points=points, flags=flags)

    pieces: list[tuple[str, int]] = []
    last = 0
    for match in SCORE_RE.finditer(text):
        chunk = text[last : match.start()].strip(" \t\r\n，,、；;。．")
        pieces.append((chunk, int(match.group(1))))
        last = match.end()
    trailing = text[last:].strip()
    if trailing and not re.fullmatch(r"[。．.；;]+", trailing):
        flags.append(f"標準答末尾有未標分數的文字：「{trailing}」")

    if not pieces:
        # no explicit per-point marks; keep the whole model as one unverified block
        flags.append("標準答未標各點分數，暫整段作一點，須人手拆點")
        accept = expand_slash(strip_scores(text))
        return ParsedModel(
            model_answer=strip_scores(text),
            points=[
                ParsedPoint(
                    id=f"{id_prefix}1",
                    max=0,
                    desc=strip_scores(text),
                    accept=accept or [strip_scores(text)],
                    flags=["max 未從卷面拆出"],
                )
            ],
            flags=flags,
        )

    points = []
    for i, (chunk, score) in enumerate(pieces, 1):
        if not chunk:
            flags.append(f"第{i}點分數標記前沒有文字")
            continue
        point_flags = []
        if AND_HINT_RE.search(chunk) or "，有的" in chunk:
            point_flags.append("同一分點含兩個方向，只寫一邊是否全扣，須人手核對")
        if (
            i > 1
            and points
            and len(points[-1].desc) <= 4
            and chunk.startswith(("出", "了"))
            and len(chunk) > 1
        ):
            point_flags.append(
                f"分點以「{chunk[0]}」開頭（上一點是「{points[-1].desc}」），已暫去掉這個字，須人手核對"
            )
            chunk = chunk[1:]
        accept = expand_slash(chunk)
        points.append(
            ParsedPoint(
                id=f"{id_prefix}{i}",
                max=score,
                desc=chunk,
                accept=accept or [chunk],
                flags=point_flags,
            )
        )
    return ParsedModel(model_answer=strip_scores(text), points=points, flags=flags)
