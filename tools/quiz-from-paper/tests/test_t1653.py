import json
import os
import unittest
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from quiz_from_paper.cli import main

# Local-only integration fixtures (not committed). Override with env if needed.
DOCX = Path(os.environ.get("QFP_T1653_DOCX", "/workspace/utrevision-quiz-t1653.docx"))
OUT = ROOT / "out" / "test-t1653"
HAND = Path(os.environ.get("QFP_T1653_HAND", "/workspace/utrevision-t1653/shide-xishan.json"))
BANK = Path(os.environ.get("QFP_T1653_BANK", "/workspace/wenyan-quiz-web/src/data/8passages.json"))


@unittest.skipUnless(DOCX.is_file(), "local t1653 teacher docx is not present")
class T1653ConvertTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        OUT.mkdir(parents=True, exist_ok=True)
        args = [
            "convert",
            "--input",
            str(DOCX),
            "--id",
            "shide-xishan",
            "--out-dir",
            str(OUT),
        ]
        if BANK.is_file():
            args.extend(["--bank", str(BANK)])
        if HAND.is_file():
            args.extend(["--compare", str(HAND)])
        cls.rc = main(args)
        cls.quiz = json.loads((OUT / "shide-xishan.json").read_text(encoding="utf-8"))

    def test_counts(self):
        quiz = self.quiz
        self.assertEqual(len(quiz["items"]), 20)
        self.assertEqual(quiz["totalMax"], 50)
        self.assertEqual(sum(i["max"] for i in quiz["items"]), 50)
        self.assertEqual(quiz["timeLimitMin"], 35)
        self.assertEqual(quiz["designer"], "T44")
        kinds = [i["type"] for i in quiz["items"]]
        self.assertEqual(kinds.count("gloss"), 10)
        self.assertEqual(kinds.count("sentence_translate"), 3)
        self.assertEqual(kinds.count("long_points"), 4)
        self.assertEqual(kinds.count("kara_table"), 3)

    def test_section_scores(self):
        items = {i["id"]: i for i in self.quiz["items"]}
        self.assertEqual(sum(items[f"a{n}"]["max"] for n in range(1, 11)), 10)
        self.assertEqual(sum(items[f"b{n}"]["max"] for n in range(1, 4)), 9)
        self.assertEqual(sum(items[f"c{n}"]["max"] for n in range(1, 8)), 31)
        self.assertEqual(items["c1"]["max"], 5)
        self.assertEqual(items["c2"]["max"], 4)
        self.assertEqual(items["c3"]["max"], 3)
        self.assertEqual(items["c4"]["max"], 4)
        self.assertEqual(items["c5"]["max"], 5)
        self.assertEqual(items["c6"]["max"], 4)
        self.assertEqual(items["c7"]["max"], 6)

    def test_gloss_from_paper(self):
        a1 = next(i for i in self.quiz["items"] if i["id"] == "a1")
        self.assertEqual(a1["stem"], "自余為僇人")
        self.assertEqual(a1["target"], "僇")
        self.assertEqual(a1["answers"], ["有罪的", "受刑罰的"])
        a5 = next(i for i in self.quiz["items"] if i["id"] == "a5")
        self.assertEqual(a5["stem"], "窮迴溪")
        self.assertIn("到……盡頭", a5["answers"])
        self.assertIn("窮盡", a5["answers"])
        a6 = next(i for i in self.quiz["items"] if i["id"] == "a6")
        self.assertEqual(a6["answers"], ["趨向", "前往"])

    def test_c1_verbs(self):
        c1 = next(i for i in self.quiz["items"] if i["id"] == "c1")
        self.assertEqual([p["desc"] for p in c1["points"]], ["過", "緣", "斫", "焚", "窮"])

    def test_c7_devices(self):
        c7 = next(i for i in self.quiz["items"] if i["id"] == "c7")
        devices = []
        for row in c7["rows"]:
            cell = row["cells"][0]
            devices.append(cell.get("answers") or [p["accept"][0] for p in cell.get("points", [])][:1])
        flat = [d for group in devices for d in (group if isinstance(group, list) else [group])]
        self.assertTrue(any("對偶" in str(x) for x in flat))
        self.assertTrue(any("排比" in str(x) for x in flat))
        self.assertTrue(any("借代" in str(x) for x in flat))
        # original 谿 kept
        self.assertTrue(any("窮迴谿" in (r["person"] or "") for r in c7["rows"]))


if __name__ == "__main__":
    unittest.main()
