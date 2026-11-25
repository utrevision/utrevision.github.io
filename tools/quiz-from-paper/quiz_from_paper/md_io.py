"""Canonical intermediate markdown: the handoff 總管 can transcribe into, and the script can emit."""

from __future__ import annotations

import re
from pathlib import Path

from .docx_extract import Paper, PaperItem, PaperMeta
from .ids import infer_quiz_id, infer_source_label, title_from_heading

FRONTMATTER_RE = re.compile(r"^---\s*\n(.*?)\n---\s*\n", re.S)
SECTION_HEAD_RE = re.compile(r"^#\s+([甲乙丙丁戊己庚辛])、\s*(.+?)(?:（\s*(\d+)\s*分\s*）)?\s*$")
ITEM_HEAD_RE = re.compile(r"^##\s+([甲乙丙丁戊己庚辛])(\d+)(?:（\s*(\d+)\s*分\s*）)?\s*$")


def paper_to_md(paper: Paper, quiz_id: str | None = None) -> str:
    meta = paper.meta
    qid = infer_quiz_id(meta.title, quiz_id)
    label = infer_source_label(meta.title)
    lines = ["---"]
    lines.append(f"id: {qid}")
    lines.append(f"title: {meta.title}")
    if meta.designer:
        lines.append(f"designer: {meta.designer}")
    if meta.timeLimitMin is not None:
        lines.append(f"timeLimitMin: {meta.timeLimitMin}")
    if meta.totalMax is not None:
        lines.append(f"totalMax: {meta.totalMax}")
    if label:
        lines.append(f"sourceLabel: {label}")
    if meta.source_path:
        lines.append(f"source: {meta.source_path}")
    lines.append("---")
    lines.append("")

    current = None
    for item in paper.items:
        if item.section != current:
            current = item.section
            title = paper.section_titles.get(current, "")
            sec_max = paper.section_max.get(current)
            head = f"# {current}、{title}" if title else f"# {current}"
            if sec_max:
                head += f"（{sec_max}分）"
            lines.append(head)
            lines.append("")
        qno = f"{item.section}{item.number}"
        head = f"## {qno}"
        if item.max:
            head += f"（{item.max}分）"
        lines.append(head)
        lines.append(f"type: {item.type}")
        if item.prompt:
            lines.append(f"prompt: {item.prompt}")
        if item.type == "gloss":
            lines.append(f"stem: {item.stem}")
            lines.append(f"target: {item.target}")
            lines.append(f"answers: {item.answers_raw}")
            lines.append(f"accept1: {item.accept1_raw}")
            lines.append(f"accept05: {item.accept05_raw}")
        elif item.type == "sentence_translate":
            lines.append(f"source: {item.source_text}")
            lines.append(f"model: {item.model_raw}")
        elif item.type == "long_points":
            lines.append(f"model: {item.model_raw}")
        elif item.type == "kara_table":
            if item.given_columns:
                lines.append("given: " + "、".join(item.given_columns))
            if item.answer_columns:
                lines.append("answer: " + "、".join(item.answer_columns))
            if item.columns:
                lines.append("")
                lines.extend(_md_table(item.columns, item.rows))
        if item.flags:
            for flag in item.flags:
                lines.append(f"flag: {flag}")
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def md_to_paper(text: str, source_path: str = "") -> tuple[Paper, str]:
    fm, body = _split_frontmatter(text)
    meta = PaperMeta(
        title=fm.get("title", ""),
        designer=fm.get("designer"),
        timeLimitMin=_maybe_int(fm.get("timeLimitMin")),
        totalMax=_maybe_int(fm.get("totalMax")),
        source_path=fm.get("source") or source_path,
    )
    paper = Paper(meta=meta)
    quiz_id = fm.get("id") or infer_quiz_id(meta.title)
    current_section = None
    chunks = _split_items(body)
    for head, block in chunks:
        if head["kind"] == "section":
            current_section = head["section"]
            paper.section_titles[current_section] = head["title"]
            if head["max"] is not None:
                paper.section_max[current_section] = head["max"]
            continue
        fields, table = _parse_item_block(block)
        section = head["section"]
        number = head["number"]
        typ = fields.get("type") or _guess_type(fields, table)
        item = PaperItem(
            section=section,
            number=number,
            type=typ,
            max=head["max"] or _maybe_int(fields.get("max")) or 0,
            prompt=fields.get("prompt", ""),
            stem=fields.get("stem", ""),
            target=fields.get("target", ""),
            answers_raw=fields.get("answers", ""),
            accept1_raw=fields.get("accept1", ""),
            accept05_raw=fields.get("accept05", ""),
            source_text=fields.get("source", ""),
            model_raw=fields.get("model", ""),
            flags=_as_list(fields.get("flag")),
        )
        if table:
            item.columns = table[0]
            item.rows = table[1:]
            given = _split_names(fields.get("given", ""))
            answer = _split_names(fields.get("answer", ""))
            if not given or not answer:
                from .docx_extract import _classify_columns

                auto_g, auto_a = _classify_columns(item.columns, item.rows)
                item.given_columns = given or auto_g
                item.answer_columns = answer or auto_a
            else:
                item.given_columns = given
                item.answer_columns = answer
        paper.items.append(item)
        current_section = section
    if fm.get("sourceLabel") and not meta.title:
        meta.title = fm["sourceLabel"]
    return paper, quiz_id


def load_md(path: str) -> tuple[Paper, str]:
    text = Path(path).read_text(encoding="utf-8")
    return md_to_paper(text, source_path=path)


def _split_frontmatter(text: str) -> tuple[dict[str, str], str]:
    m = FRONTMATTER_RE.match(text)
    if not m:
        return {}, text
    data: dict[str, str] = {}
    for line in m.group(1).splitlines():
        if not line.strip() or line.strip().startswith("#"):
            continue
        if ":" not in line:
            continue
        key, val = line.split(":", 1)
        data[key.strip()] = val.strip()
    return data, text[m.end() :]


def _maybe_int(v: str | None) -> int | None:
    if v is None or v == "":
        return None
    try:
        return int(str(v).strip())
    except ValueError:
        return None


def _split_items(body: str) -> list[tuple[dict, str]]:
    lines = body.splitlines()
    chunks: list[tuple[dict, list[str]]] = []
    current_head = None
    buf: list[str] = []

    def flush():
        nonlocal current_head, buf
        if current_head is not None:
            chunks.append((current_head, "\n".join(buf).strip()))
        buf = []

    for line in lines:
        if m := SECTION_HEAD_RE.match(line.strip()):
            flush()
            current_head = {
                "kind": "section",
                "section": m.group(1),
                "title": m.group(2).strip(),
                "max": int(m.group(3)) if m.group(3) else None,
                "number": 0,
            }
            buf = []
            continue
        if m := ITEM_HEAD_RE.match(line.strip()):
            flush()
            current_head = {
                "kind": "item",
                "section": m.group(1),
                "number": int(m.group(2)),
                "max": int(m.group(3)) if m.group(3) else None,
            }
            buf = []
            continue
        buf.append(line)
    flush()
    return chunks


def _parse_item_block(block: str) -> tuple[dict[str, str], list[list[str]] | None]:
    fields: dict[str, str] = {}
    table_lines: list[str] = []
    for line in block.splitlines():
        if line.strip().startswith("|"):
            table_lines.append(line)
            continue
        m = re.match(r"^(type|prompt|stem|target|answers|accept1|accept05|source|model|given|answer|max|flag)\s*:\s*(.*)$", line)
        if m:
            key, val = m.group(1), m.group(2)
            if key == "flag" and "flag" in fields:
                fields["flag"] = fields["flag"] + "\n" + val
            else:
                fields[key] = val
    table = _parse_md_table(table_lines) if table_lines else None
    return fields, table


def _guess_type(fields: dict[str, str], table) -> str:
    if table:
        return "kara_table"
    if fields.get("stem") or fields.get("target"):
        return "gloss"
    if fields.get("source"):
        return "sentence_translate"
    return "long_points"


def _split_names(text: str) -> list[str]:
    if not text.strip():
        return []
    return [p.strip() for p in re.split(r"[、,，]", text) if p.strip()]


def _as_list(v: str | None) -> list[str]:
    if not v:
        return []
    return [ln.strip() for ln in v.splitlines() if ln.strip()]


def _md_table(headers: list[str], rows: list[list[str]]) -> list[str]:
    def esc(s: str) -> str:
        return (s or "").replace("|", "\\|").replace("\n", "<br>")

    lines = ["| " + " | ".join(esc(h) for h in headers) + " |"]
    lines.append("| " + " | ".join("---" for _ in headers) + " |")
    for row in rows:
        padded = list(row) + [""] * (len(headers) - len(row))
        lines.append("| " + " | ".join(esc(c) for c in padded[: len(headers)]) + " |")
    return lines


def _parse_md_table(lines: list[str]) -> list[list[str]]:
    rows: list[list[str]] = []
    for line in lines:
        line = line.strip()
        if re.match(r"^\|?\s*:?---", line.replace(" | ", "")):
            # separator
            cells = [c.strip() for c in line.strip("|").split("|")]
            if all(re.fullmatch(r":?-{3,}:?", c.replace(" ", "")) for c in cells if c):
                continue
        inner = line.strip()
        if inner.startswith("|"):
            inner = inner[1:]
        if inner.endswith("|"):
            inner = inner[:-1]
        cells = [c.strip().replace("<br>", "\n").replace("\\|", "|") for c in _split_row(inner)]
        rows.append(cells)
    return rows


def _split_row(inner: str) -> list[str]:
    parts: list[str] = []
    buf = []
    escape = False
    for ch in inner:
        if escape:
            buf.append(ch)
            escape = False
            continue
        if ch == "\\":
            escape = True
            continue
        if ch == "|":
            parts.append("".join(buf))
            buf = []
            continue
        buf.append(ch)
    parts.append("".join(buf))
    return parts
