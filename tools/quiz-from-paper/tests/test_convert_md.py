import json
import tempfile
import unittest
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from quiz_from_paper.cli import main

SAMPLE_MD = """---
id: sample-convert
title: 轉換腳本樣本小測
designer: T00
timeLimitMin: 10
totalMax: 10
sourceLabel: 樣本
---

# 甲、字詞語譯（2分）

## 甲1（1分）
type: gloss
stem: 學而時習之
target: 習
answers: 溫習／複習
accept1:
accept05:

## 甲2（1分）
type: gloss
stem: 不亦說乎
target: 說
answers: 愉快／喜悅
accept1: 高興
accept05:

# 乙、句子語譯（3分）

## 乙1（3分）
type: sentence_translate
source: 有朋自遠方來，不亦樂乎。
model: 有朋友從遠方來（1分），不也是快樂的嗎（2分）。

# 丙、內容及作法分析（5分）

## 丙1（2分）
type: long_points
prompt: 試解釋作者的學習態度。（2分）
model: 經常溫習（1分）／並以交朋友為樂（1分）。

## 丙2（3分）
type: kara_table
prompt: 指出下列句子的修辭手法。（3分）
given: 句子
answer: 修辭

| 句子 | 修辭 |
| --- | --- |
| 學而時習之 | 頂真（1分） |
| 有朋自遠方來 | 反問（1分） |
| 人不知而不慍 | 對偶（1分） |
"""


class ConvertMdTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.out = Path(cls.tmp.name) / "out"
        cls.src = Path(cls.tmp.name) / "sample-convert.md"
        cls.src.write_text(SAMPLE_MD, encoding="utf-8")
        cls.rc = main(
            [
                "convert",
                "--input",
                str(cls.src),
                "--id",
                "sample-convert",
                "--out-dir",
                str(cls.out),
            ]
        )
        cls.quiz = json.loads((cls.out / "sample-convert.json").read_text(encoding="utf-8"))
        cls.review = (cls.out / "sample-convert.review.md").read_text(encoding="utf-8")

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def test_exit_and_outputs(self):
        self.assertEqual(self.rc, 0)
        self.assertTrue((self.out / "sample-convert.md").is_file())
        self.assertTrue((self.out / "sample-convert.json").is_file())
        self.assertTrue((self.out / "sample-convert.review.md").is_file())

    def test_meta_and_counts(self):
        quiz = self.quiz
        self.assertEqual(quiz["id"], "sample-convert")
        self.assertEqual(quiz["designer"], "T00")
        self.assertEqual(quiz["timeLimitMin"], 10)
        self.assertEqual(quiz["totalMax"], 10)
        self.assertEqual(len(quiz["items"]), 5)
        self.assertEqual(sum(i["max"] for i in quiz["items"]), 10)
        kinds = [i["type"] for i in quiz["items"]]
        self.assertEqual(kinds, ["gloss", "gloss", "sentence_translate", "long_points", "kara_table"])

    def test_gloss_slash_and_accept1(self):
        a1 = next(i for i in self.quiz["items"] if i["id"] == "a1")
        self.assertEqual(a1["stem"], "學而時習之")
        self.assertEqual(a1["target"], "習")
        self.assertEqual(a1["answers"], ["溫習", "複習"])
        a2 = next(i for i in self.quiz["items"] if i["id"] == "a2")
        self.assertEqual(a2["answers"], ["愉快", "喜悅"])
        self.assertIn("高興", a2.get("accept1") or a2.get("accept") or [])

    def test_sentence_points(self):
        b1 = next(i for i in self.quiz["items"] if i["id"] == "b1")
        self.assertEqual(b1["max"], 3)
        self.assertGreaterEqual(len(b1.get("points") or []), 2)
        self.assertEqual(sum(p["max"] for p in b1["points"]), 3)

    def test_long_points_and_table(self):
        c1 = next(i for i in self.quiz["items"] if i["id"] == "c1")
        self.assertEqual(c1["type"], "long_points")
        self.assertEqual(c1["max"], 2)
        self.assertEqual(len(c1["points"]), 2)
        c2 = next(i for i in self.quiz["items"] if i["id"] == "c2")
        self.assertEqual(c2["type"], "kara_table")
        self.assertEqual(c2["max"], 3)
        self.assertEqual(len(c2["rows"]), 3)
        devices = []
        for row in c2["rows"]:
            cell = row["cells"][-1]
            devices.append(cell.get("answers") or [p["accept"][0] for p in cell.get("points", [])][:1])
        flat = [d for group in devices for d in (group if isinstance(group, list) else [group])]
        self.assertTrue(any("頂真" in str(x) for x in flat))
        self.assertTrue(any("反問" in str(x) for x in flat))
        self.assertTrue(any("對偶" in str(x) for x in flat))

    def test_review_mentions_totals(self):
        self.assertIn("sample-convert", self.review)
        self.assertIn("10", self.review)


if __name__ == "__main__":
    unittest.main()
