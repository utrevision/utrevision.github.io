"""Quiz id helpers. Known 指定篇章 slugs; others stay explicit via --id."""

from __future__ import annotations

import re

KNOWN_TITLES = {
    "始得西山宴遊記": "shide-xishan",
    "廉頗藺相如列傳": "lianpo",
    "岳陽樓記": "yueyanglou",
    "師說": "shishuo",
    "勸學": "quanxue",
    "論仁論孝論君子": "lunren",
    "魚我所欲也": "yuwo",
    "六國論": "liuguo",
}


def title_from_heading(text: str) -> str:
    text = (text or "").strip()
    text = re.sub(r"溫習小測.*$", "", text).strip()
    return text


def infer_source_label(title: str) -> str | None:
    if not title:
        return None
    core = title
    core = core.replace("溫習小測", "").strip("《》 ")
    if core:
        return f"《{core.strip('《》')}》"
    return None


def infer_quiz_id(title: str, explicit: str | None = None) -> str:
    if explicit:
        return explicit.strip()
    core = re.sub(r"[《》\s]", "", title_from_heading(title) or title)
    for name, slug in KNOWN_TITLES.items():
        if name in core:
            return slug
    raise SystemExit(
        f"未能從標題推斷題庫 id（標題：{title!r}）。請用 --id 指定，例如 shide-xishan。"
    )
