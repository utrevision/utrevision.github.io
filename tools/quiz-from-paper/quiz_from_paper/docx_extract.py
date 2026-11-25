"""Walk a teacher-answer docx in document order and build an intermediate paper."""

from __future__ import annotations

import re
from dataclasses import dataclass, field, asdict
from typing import Any, Iterable

from docx import Document
from docx.oxml.ns import qn
from docx.table import Table
from docx.text.paragraph import Paragraph

SECTION_RE = re.compile(
    r"^([甲乙丙丁戊己庚辛])、\s*(.+?)(?:（\s*(\d+)\s*分\s*）)?\s*$"
)
META_DESIGNER_RE = re.compile(r"設計老師\s*[:：]\s*(\S+)")
META_TIME_RE = re.compile(r"限時\s*[:：]\s*(\d+)\s*分鐘")
META_TOTAL_RE = re.compile(r"總分\s*[:：]?\s*[＿_．.／/\d]*／\s*(\d+)\s*分")
SCORE_END_RE = re.compile(r"（\s*(\d+)\s*分\s*）\s*$")
SCORE_ANY_RE = re.compile(r"（\s*(?:各\s*)?(\d+)\s*分\s*）")
END_RE = re.compile(r"全\s*卷\s*完")
NAME_LINE_RE = re.compile(r"^姓名")


@dataclass
class PaperMeta:
    title: str = ""
    designer: str | None = None
    timeLimitMin: int | None = None
    totalMax: int | None = None
    source_path: str = ""


@dataclass
class PaperItem:
    section: str
    number: int
    type: str
    max: int
    prompt: str = ""
    stem: str = ""
    target: str = ""
    answers_raw: str = ""
    accept1_raw: str = ""
    accept05_raw: str = ""
    source_text: str = ""
    model_raw: str = ""
    columns: list[str] = field(default_factory=list)
    given_columns: list[str] = field(default_factory=list)
    answer_columns: list[str] = field(default_factory=list)
    rows: list[list[str]] = field(default_factory=list)
    flags: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class Paper:
    meta: PaperMeta
    section_titles: dict[str, str] = field(default_factory=dict)
    section_max: dict[str, int] = field(default_factory=dict)
    items: list[PaperItem] = field(default_factory=list)


def extract_docx(path: str) -> Paper:
    doc = Document(path)
    meta = PaperMeta(source_path=path)
    paper = Paper(meta=meta)
    current_section: str | None = None
    pending_yi_source: str | None = None
    pending_yi_max: int | None = None

    blocks = list(_iter_blocks(doc))
    # title / meta from leading paragraphs
    leading_paras = []
    start = 0
    for i, (kind, obj) in enumerate(blocks):
        if kind != "p":
            start = i
            break
        text = _para_plain(obj).strip()
        if not text:
            continue
        if SECTION_RE.match(text):
            start = i
            break
        leading_paras.append(text)
        start = i + 1
    _fill_meta(meta, leading_paras)

    i = start
    while i < len(blocks):
        kind, obj = blocks[i]
        if kind == "p":
            text = _para_plain(obj).strip()
            if not text:
                i += 1
                continue
            if END_RE.search(text):
                break
            if NAME_LINE_RE.match(text):
                i += 1
                continue
            sec = SECTION_RE.match(text)
            if sec:
                current_section = sec.group(1)
                paper.section_titles[current_section] = sec.group(2).strip()
                if sec.group(3):
                    paper.section_max[current_section] = int(sec.group(3))
                pending_yi_source = None
                i += 1
                continue
            if current_section == "甲":
                # gloss lives in the following table; stray text is ignored
                i += 1
                continue
            if current_section == "乙":
                score = _trailing_score(text)
                if pending_yi_source is None:
                    pending_yi_source = SCORE_END_RE.sub("", text).strip()
                    pending_yi_max = score
                    i += 1
                    continue
                # this paragraph is the model answer
                n = _next_number(paper, "乙")
                paper.items.append(
                    PaperItem(
                        section="乙",
                        number=n,
                        type="sentence_translate",
                        max=pending_yi_max or score or _sum_scores(text),
                        prompt="試把以下句子譯為語體文。",
                        source_text=pending_yi_source,
                        model_raw=text,
                    )
                )
                pending_yi_source = None
                pending_yi_max = None
                i += 1
                continue
            if current_section in {"丙", "丁", "戊"}:
                i = _consume_analysis(paper, blocks, i, current_section)
                continue
            i += 1
            continue

        # table
        table: Table = obj
        if current_section == "甲":
            paper.items.extend(_parse_gloss_table(table, paper))
            i += 1
            continue
        if current_section in {"丙", "丁", "戊"}:
            # orphan table without a prompt — attach as last item if possible
            if paper.items and paper.items[-1].section == current_section and not paper.items[-1].rows:
                _fill_table_item(paper.items[-1], table)
            else:
                flags = ["表格前沒有題幹，已獨立成題，須人手核對"]
                n = _next_number(paper, current_section)
                item = PaperItem(
                    section=current_section,
                    number=n,
                    type="kara_table",
                    max=_table_score(table),
                    flags=flags,
                )
                _fill_table_item(item, table)
                paper.items.append(item)
            i += 1
            continue
        i += 1

    if pending_yi_source:
        paper.items.append(
            PaperItem(
                section="乙",
                number=_next_number(paper, "乙"),
                type="sentence_translate",
                max=pending_yi_max or 0,
                prompt="試把以下句子譯為語體文。",
                source_text=pending_yi_source,
                flags=["有原文但沒有標準譯，須人手補"],
            )
        )
    return paper


def _iter_blocks(doc: Document) -> Iterable[tuple[str, Any]]:
    for child in doc.element.body.iterchildren():
        if child.tag == qn("w:p"):
            yield "p", Paragraph(child, doc)
        elif child.tag == qn("w:tbl"):
            yield "t", Table(child, doc)


def _fill_meta(meta: PaperMeta, lines: list[str]) -> None:
    if lines and not meta.title:
        meta.title = lines[0].strip()
    blob = "\n".join(lines)
    if m := META_DESIGNER_RE.search(blob):
        meta.designer = m.group(1).strip()
    if m := META_TIME_RE.search(blob):
        meta.timeLimitMin = int(m.group(1))
    if m := META_TOTAL_RE.search(blob):
        meta.totalMax = int(m.group(1))


def _para_plain(p: Paragraph) -> str:
    return p.text.replace("\u3000", " ").replace("\r", "\n")


def _para_with_bold(p: Paragraph) -> tuple[str, list[str]]:
    """Return plain text and list of bold runs (for target detection)."""
    bolds: list[str] = []
    parts: list[str] = []
    for run in p.runs:
        t = run.text or ""
        parts.append(t)
        if run.bold and t.strip():
            bolds.append(t.strip().strip("：:"))
    return "".join(parts), bolds


def _cell_text(cell) -> str:
    paras = [p.text.strip() for p in cell.paragraphs]
    paras = [p for p in paras if p]
    if not paras:
        return ""
    out = paras[0]
    for nxt in paras[1:]:
        if out.endswith(("，", "、", "；", "：", ",", ";", "：")):
            out += nxt
        else:
            out += nxt if nxt.startswith(("，", "。", "、")) else "，" + nxt if _looks_continuation(out, nxt) else "\n" + nxt
    return out.strip()


def _looks_continuation(prev: str, nxt: str) -> bool:
    # two sentences of a quote packed into one cell
    return bool(prev) and not prev.endswith(("。", "！", "？", ".", "!", "?"))


def _trailing_score(text: str) -> int | None:
    m = SCORE_END_RE.search(text.strip())
    return int(m.group(1)) if m else None


def _sum_scores(text: str) -> int:
    return sum(int(x) for x in SCORE_ANY_RE.findall(text))


def _next_number(paper: Paper, section: str) -> int:
    return sum(1 for it in paper.items if it.section == section) + 1


def _parse_gloss_table(table: Table, paper: Paper) -> list[PaperItem]:
    items: list[PaperItem] = []
    for row in table.rows:
        cells = [_cell_text(c) for c in row.cells]
        if len(cells) < 3:
            continue
        stem_plain, stem_bolds = _row_first_cell_bold(row)
        stem = stem_plain or cells[0]
        target_cell = cells[1]
        target = re.sub(r"[:：]\s*$", "", target_cell).strip()
        target = target.replace("**", "")
        if not stem_bolds and not target:
            # maybe a header
            continue
        if not target and stem_bolds:
            target = stem_bolds[-1]
        # if target still has 字
        target = target.rstrip("：:")
        answers = cells[2].strip()
        n = _next_number(paper, "甲") + len(items)
        flags = []
        if not target:
            flags.append("未能讀出考核字")
        if not answers:
            flags.append("答案欄空白（或許是學生本）")
        items.append(
            PaperItem(
                section="甲",
                number=n,
                type="gloss",
                max=1,
                prompt="試解釋以下文句中粗體字的意思。",
                stem=_clean_stem(stem, target),
                target=target,
                answers_raw=answers,
                flags=flags,
            )
        )
    return items


def _row_first_cell_bold(row) -> tuple[str, list[str]]:
    cell = row.cells[0]
    texts: list[str] = []
    bolds: list[str] = []
    for p in cell.paragraphs:
        plain, bold = _para_with_bold(p)
        texts.append(plain)
        bolds.extend(bold)
    return "".join(texts).strip(), bolds


def _clean_stem(stem: str, target: str) -> str:
    return stem.replace("**", "").strip()


def _consume_analysis(paper: Paper, blocks: list, i: int, section: str) -> int:
    kind, obj = blocks[i]
    text = _para_plain(obj).strip()
    score = _trailing_score(text.split("\n")[0].strip()) if text else None
    # split same-paragraph prompt + answer
    first_line, rest = _split_prompt_and_rest(text)
    prompt_score = _trailing_score(first_line) or score
    prompt = SCORE_END_RE.sub("", first_line).strip()
    model = rest.strip()
    n = _next_number(paper, section)
    # look ahead for a table or more answer paras
    j = i + 1
    answer_parts = [model] if model else []
    table = None
    while j < len(blocks):
        k2, obj2 = blocks[j]
        if k2 == "p":
            t2 = _para_plain(obj2).strip()
            if not t2:
                j += 1
                continue
            if END_RE.search(t2) or SECTION_RE.match(t2):
                break
            # next question prompt? ends with （n分） and does not look like a marked answer-only line
            if _looks_new_prompt(t2) and answer_parts:
                break
            if _looks_new_prompt(t2) and not answer_parts:
                # this is a new prompt and we only have the current prompt — stop before it
                # (no answers yet; maybe a table follows current? handled below)
                break
            answer_parts.append(t2)
            j += 1
            continue
        # table
        table = obj2
        j += 1
        break

    model_raw = "\n".join(p for p in answer_parts if p).strip()
    if table is not None:
        item = PaperItem(
            section=section,
            number=n,
            type="kara_table",
            max=prompt_score or _table_score(table) or _sum_scores(model_raw),
            prompt=first_line if prompt_score else prompt,
            model_raw=model_raw,
        )
        # keep （n分） on prompt to match existing papers
        if prompt_score and not first_line.endswith("分）") and not first_line.endswith("分)"):
            item.prompt = f"{prompt}（{prompt_score}分）"
        elif prompt_score:
            item.prompt = first_line.strip()
        else:
            item.prompt = prompt
        _fill_table_item(item, table)
        paper.items.append(item)
        return j

    # long_points / free answer
    if prompt_score and not SCORE_END_RE.search(first_line.strip()):
        prompt_out = f"{prompt}（{prompt_score}分）"
    else:
        prompt_out = first_line.strip() or prompt
    item = PaperItem(
        section=section,
        number=n,
        type="long_points",
        max=prompt_score or _sum_scores(model_raw),
        prompt=prompt_out,
        model_raw=model_raw,
        flags=[] if model_raw else ["題幹後沒有標準答，須人手補"],
    )
    paper.items.append(item)
    return j


def _split_prompt_and_rest(text: str) -> tuple[str, str]:
    text = text.strip()
    # Prefer the first line if it ends with a score and there is more
    if "\n" in text:
        first, rest = text.split("\n", 1)
        if _trailing_score(first.strip()):
            return first.strip(), rest.strip()
    # same line: prompt（n分）answer
    m = SCORE_END_RE.search(text)
    if m and m.end() < len(text):
        return text[: m.end()].strip(), text[m.end() :].strip()
    # first score in the paragraph: only treat as prompt if the part after looks like an answer
    matches = list(SCORE_ANY_RE.finditer(text))
    if matches:
        first = matches[0]
        after = text[first.end() :].strip()
        if after and (_sum_scores(after) or after.startswith(("過", "緣")) or "（" in after):
            return text[: first.end()].strip(), after
    return text, ""


def _looks_new_prompt(text: str) -> bool:
    first = text.split("\n", 1)[0].strip()
    if not _trailing_score(first):
        return False
    # an answer line also has scores, but usually not ending the *first* clause
    # with the question particles 試／何／哪些／怎樣／為甚麼／列出／解釋
    if re.search(r"(試|為何|為甚麼|怎樣|如何|何種|哪些|哪五|列出|解釋|判斷|完成下表|有何作用|暗示)", first):
        return True
    # if the whole paragraph is short and ends with 分） and has no inner scores
    inner = SCORE_ANY_RE.findall(first)
    return len(inner) == 1 and first.endswith("分）")


def _fill_table_item(item: PaperItem, table: Table) -> None:
    rows = [[_cell_text(c) for c in row.cells] for row in table.rows]
    if not rows:
        item.flags.append("空表")
        return
    headers = [h.strip() for h in rows[0]]
    # drop fully empty trailing columns? keep as-is
    item.columns = headers
    item.rows = rows[1:]
    given, answer = _classify_columns(headers, item.rows)
    item.given_columns = given
    item.answer_columns = answer
    if not item.max:
        item.max = _table_score(table)


def _classify_columns(headers: list[str], data_rows: list[list[str]]) -> tuple[list[str], list[str]]:
    if not headers:
        return [], []
    given: list[str] = []
    answer: list[str] = []
    GIVEN_NAMES = {"引文", "原文", "時間", "觀景角度", "句子"}
    ANSWER_NAMES = {"解釋", "景色", "修辭", "修辭手法", "答案", "手法"}
    for idx, name in enumerate(headers):
        col_vals = [(r[idx] if idx < len(r) else "") for r in data_rows]
        has_score = any(SCORE_ANY_RE.search(v or "") for v in col_vals)
        if name in ANSWER_NAMES or has_score:
            answer.append(name)
        elif name in GIVEN_NAMES:
            given.append(name)
        elif idx == 0:
            given.append(name)
        elif idx == len(headers) - 1:
            answer.append(name)
        else:
            given.append(name)
    # first column is the row label; it stays "given" even if also listed
    if headers[0] not in given:
        given = [headers[0], *given]
    # ensure at least one answer col
    if not answer and len(headers) >= 2:
        answer = [headers[-1]]
        given = [h for h in given if h not in answer]
    return given, answer


def _table_score(table: Table) -> int:
    total = 0
    for row in table.rows:
        for cell in row.cells:
            total += _sum_scores(_cell_text(cell))
    return total
