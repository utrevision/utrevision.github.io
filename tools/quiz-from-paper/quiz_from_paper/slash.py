"""Expand ／ alternatives the way HK 文言 papers write them.

The converter never invents synonyms. It only splits what the paper wrote
with a fullwidth slash, and records ellipsis variants.
"""

from __future__ import annotations

import re

SLASH = "／"
ELLIPSES = ("……", "…", "...")
CLAUSE_RE = re.compile(r"([，,])")


def expand_slash(text: str) -> list[str]:
    text = (text or "").strip()
    if not text:
        return []
    if SLASH not in text:
        return _ellipsis_variants(text)
    # Do not let a slash in one clause rewrite another clause
    # (「有的高峻／高聳，有的低陷／凹陷」).
    if CLAUSE_RE.search(text):
        tokens = CLAUSE_RE.split(text)
        acc = [""]
        for tok in tokens:
            if tok in {"，", ","}:
                acc = [a + tok for a in acc]
                continue
            opts = _expand_group(tok) or [tok]
            acc = [a + o for a in acc for o in opts]
        out: list[str] = []
        for item in acc:
            for variant in _ellipsis_variants(item):
                if variant not in out:
                    out.append(variant)
        return out
    return _expand_group(text)


def _expand_group(text: str) -> list[str]:
    text = (text or "").strip()
    if not text:
        return []
    if SLASH not in text:
        return _ellipsis_variants(text)
    parts = [p.strip() for p in text.split(SLASH)]
    rewrite = False
    for i in range(len(parts) - 1):
        if _merge_pair(parts[i], parts[i + 1]) != [parts[i], parts[i + 1]]:
            rewrite = True
            break
    if rewrite:
        acc = [parts[0]]
        for part in parts[1:]:
            merged: list[str] = []
            for left in acc:
                merged.extend(_merge_pair(left, part))
            acc = list(dict.fromkeys(merged))
    else:
        acc = parts
    out: list[str] = []
    for item in acc:
        for variant in _ellipsis_variants(item):
            if variant not in out:
                out.append(variant)
    return out


def _ellipsis_variants(text: str) -> list[str]:
    variants = [text]
    stripped = text
    for mark in ELLIPSES:
        if mark in stripped:
            stripped = stripped.replace(mark, "")
    stripped = stripped.strip()
    if stripped and stripped not in variants:
        variants.append(stripped)
    return variants


def _prefix_alt(a: str, b: str) -> list[str] | None:
    """「（我以為大概）這／這個州裡」→ 這州裡、這個州裡，可帶前綴。"""
    max_ov = min(len(a), len(b))
    for ov in range(max_ov, 0, -1):
        if not a.endswith(b[:ov]):
            continue
        rest = b[ov:]
        for mid_len in range(1, min(3, len(rest)) + 1):
            suffix = rest[mid_len:]
            if not suffix:
                continue
            lead = a[:-ov]
            alt1 = lead + b[:ov] + suffix
            alt2 = lead + b  # overlap + mid + suffix
            return [alt1, alt2]
    return None


def _merge_pair(a: str, b: str) -> list[str]:
    a = a.strip()
    b = b.strip()
    if not a:
        return [b] if b else []
    if not b:
        return [a]

    prefixed = _prefix_alt(a, b)
    if prefixed:
        return prefixed

    # 「有特別形態的山峰／山水」→ keep the shared lead, swap the tail
    for i in range(len(a)):
        tail = a[i:]
        common = 0
        while common < len(tail) and common < len(b) and tail[common] == b[common]:
            common += 1
        if common >= 1:
            merged_b = a[:i] + b
            # 「經常／常常」會在交界疊到「常」，結果變成「經常常」；這種重疊不當改寫。
            if merged_b.startswith(a):
                continue
            return [a, merged_b]

    return _maybe_copy_lead(a, b)


def _maybe_copy_lead(a: str, b: str) -> list[str]:
    """「有的低陷／凹陷」「像洞穴／蟻穴」：把左邊的修飾語接到右邊。"""
    if any(mark in a for mark in ELLIPSES):
        return [a, b]
    if not (2 <= len(b) <= 3 and len(a) > 2):
        return [a, b]
    lead = a[:-2]
    if not lead or b.startswith(lead):
        return [a, b]
    return [a, lead + b]
