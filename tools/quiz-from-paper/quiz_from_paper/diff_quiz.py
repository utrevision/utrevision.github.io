"""Compare script JSON against a hand-edited LongQuiz JSON."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any


def diff_quizzes(script: dict[str, Any], hand: dict[str, Any]) -> str:
    lines = [
        f"# 腳本稿 vs 人手稿",
        "",
        f"- 腳本 id：`{script.get('id')}`；人手 id：`{hand.get('id')}`",
        f"- 腳本題數 {len(script.get('items') or [])}／總分 {script.get('totalMax')}；"
        f"人手題數 {len(hand.get('items') or [])}／總分 {hand.get('totalMax')}",
        "",
    ]
    s_items = {it["id"]: it for it in script.get("items") or []}
    h_items = {it["id"]: it for it in hand.get("items") or []}
    only_s = [i for i in s_items if i not in h_items]
    only_h = [i for i in h_items if i not in s_items]
    if only_s:
        lines.append("人手稿沒有的題：" + "、".join(f"{s_items[i].get('qNo', i)}" for i in only_s))
        lines.append("")
    if only_h:
        lines.append("腳本沒有的題：" + "、".join(f"{h_items[i].get('qNo', i)}" for i in only_h))
        lines.append("")

    lines.append("## 結構／卷面（應與原卷一致）")
    lines.append("")
    structural_ok = True
    for iid in [i for i in s_items if i in h_items]:
        s, h = s_items[iid], h_items[iid]
        notes = []
        for field in ("qNo", "type", "max", "stem", "target", "source", "prompt"):
            sv, hv = s.get(field), h.get(field)
            if sv is None and hv is None:
                continue
            if _norm(sv) != _norm(hv):
                notes.append(f"{field} 不同：腳本={_brief(sv)}；人手={_brief(hv)}")
        if s.get("type") in {"sentence_translate", "long_points"}:
            if len(s.get("points") or []) != len(h.get("points") or []):
                notes.append(
                    f"分點數目 腳本 {len(s.get('points') or [])} ≠ 人手 {len(h.get('points') or [])}"
                )
            else:
                for a, b in zip(s.get("points") or [], h.get("points") or []):
                    if a.get("max") != b.get("max"):
                        notes.append(f"分點 {a.get('id')} 滿分 腳本 {a.get('max')} ≠ 人手 {b.get('max')}")
        if s.get("type") == "kara_table":
            if (s.get("columns") or []) != (h.get("columns") or []):
                notes.append(f"欄名不同：腳本={s.get('columns')}；人手={h.get('columns')}")
            if len(s.get("rows") or []) != len(h.get("rows") or []):
                notes.append(
                    f"列數 腳本 {len(s.get('rows') or [])} ≠ 人手 {len(h.get('rows') or [])}"
                )
        if notes:
            structural_ok = False
            lines.append(f"- **{s.get('qNo', iid)}**")
            for n in notes:
                lines.append(f"  - {n}")
    if structural_ok and not only_s and not only_h:
        lines.append("- 題號、題型、滿分、題幹／原句／考核字、分點數目與各點滿分均一致。")
    lines.append("")

    lines.append("## 答案層（腳本只按卷面拆「／」；人手常會補同義、關鍵詞、拒答）")
    lines.append("")
    for iid in [i for i in s_items if i in h_items]:
        s, h = s_items[iid], h_items[iid]
        chunks = _answer_diff(s, h)
        if chunks:
            lines.append(f"- **{s.get('qNo', iid)}**")
            lines.extend(f"  - {c}" for c in chunks)
    lines.append("")
    lines.append("說明：腳本不會把關鍵詞、拒答條件、現站舊答寫進去。人手稿多出來的接受項／accept1 須由用戶決定是否保留。")
    lines.append("")
    return "\n".join(lines)


def _answer_diff(s: dict[str, Any], h: dict[str, Any]) -> list[str]:
    out: list[str] = []
    if s.get("type") == "gloss":
        out.extend(_list_delta("answers", s.get("answers"), h.get("answers")))
        out.extend(_list_delta("accept1", s.get("accept1"), h.get("accept1")))
        out.extend(_list_delta("accept05", s.get("accept05"), h.get("accept05")))
        return out
    if s.get("type") in {"sentence_translate", "long_points"}:
        if _norm(s.get("modelAnswer")) != _norm(h.get("modelAnswer")):
            out.append(f"modelAnswer 不同：腳本={_brief(s.get('modelAnswer'))}；人手={_brief(h.get('modelAnswer'))}")
        for a, b in zip(s.get("points") or [], h.get("points") or []):
            label = a.get("id") or b.get("id")
            out.extend(_list_delta(f"{label}.accept", a.get("accept"), b.get("accept")))
            if b.get("keywords"):
                out.append(f"{label} 人手另有 keywords：{b.get('keywords')}")
            if b.get("reject"):
                out.append(f"{label} 人手另有 reject：{b.get('reject')}")
            if b.get("rejectNote"):
                out.append(f"{label} 人手另有 rejectNote：{_brief(b.get('rejectNote'))}")
        return out
    if s.get("type") == "kara_table":
        s_rows, h_rows = s.get("rows") or [], h.get("rows") or []
        for i, (sr, hr) in enumerate(zip(s_rows, h_rows), 1):
            if _norm(sr.get("person")) != _norm(hr.get("person")):
                out.append(f"第{i}行 row key 不同：腳本={sr.get('person')}；人手={hr.get('person')}")
            for sc, hc in zip(sr.get("cells") or [], hr.get("cells") or []):
                loc = f"第{i}行 {sc.get('label') or sc.get('key')}"
                if sc.get("given") != hc.get("given"):
                    out.append(f"{loc} given 腳本={sc.get('given')} 人手={hc.get('given')}")
                    continue
                if sc.get("given"):
                    if _norm(sc.get("text")) != _norm(hc.get("text")):
                        out.append(f"{loc} 已給文字不同")
                    continue
                if sc.get("max") != hc.get("max"):
                    out.append(f"{loc} 滿分 腳本={sc.get('max')} 人手={hc.get('max')}")
                out.extend(_list_delta(f"{loc}.answers", sc.get("answers"), hc.get("answers")))
                out.extend(_list_delta(f"{loc}.accept1", sc.get("accept1"), hc.get("accept1")))
                if (sc.get("points") or []) or (hc.get("points") or []):
                    if len(sc.get("points") or []) != len(hc.get("points") or []):
                        out.append(
                            f"{loc} 分點數 腳本 {len(sc.get('points') or [])} ≠ 人手 {len(hc.get('points') or [])}"
                        )
                    for a, b in zip(sc.get("points") or [], hc.get("points") or []):
                        out.extend(_list_delta(f"{loc}.{a.get('id')}.accept", a.get("accept"), b.get("accept")))
                        if b.get("keywords"):
                            out.append(f"{loc}.{a.get('id')} 人手另有 keywords：{b.get('keywords')}")
                        if b.get("reject"):
                            out.append(f"{loc}.{a.get('id')} 人手另有 reject：{b.get('reject')}")
        return out
    return out


def _list_delta(label: str, script_list, hand_list) -> list[str]:
    a = [_norm(x) for x in (script_list or []) if _norm(x)]
    b = [_norm(x) for x in (hand_list or []) if _norm(x)]
    only_s = [x for x in (script_list or []) if _norm(x) not in set(b)]
    only_h = [x for x in (hand_list or []) if _norm(x) not in set(a)]
    if not only_s and not only_h:
        return []
    bits = []
    if only_h:
        bits.append("人手多了 " + "、".join(only_h))
    if only_s:
        bits.append("腳本多了 " + "、".join(only_s))
    return [f"{label}：" + "；".join(bits)]


def _norm(v: Any) -> str:
    if v is None:
        return ""
    if isinstance(v, list):
        return "／".join(_norm(x) for x in v)
    return str(v).strip().replace("\n", "").replace(" ", "")


def _brief(v: Any, n: int = 80) -> str:
    s = "" if v is None else str(v).replace("\n", " ")
    return s if len(s) <= n else s[: n - 1] + "…"


def load(path: str) -> dict[str, Any]:
    return json.loads(Path(path).read_text(encoding="utf-8"))
