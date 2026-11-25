import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from quiz_from_paper.slash import expand_slash


class SlashTest(unittest.TestCase):
    def test_full_alternatives(self):
        self.assertEqual(expand_slash("有罪的／受刑罰的"), ["有罪的", "受刑罰的"])
        self.assertEqual(expand_slash("經常／常常"), ["經常", "常常"])
        self.assertEqual(expand_slash("如果／假若"), ["如果", "假若"])
        self.assertEqual(expand_slash("同伴／友人"), ["同伴", "友人"])
        self.assertEqual(expand_slash("趨向／前往"), ["趨向", "前往"])
        self.assertEqual(expand_slash("砍伐／斬"), ["砍伐", "斬"])
        self.assertEqual(expand_slash("撰寫／寫作"), ["撰寫", "寫作"])
        self.assertEqual(expand_slash("襯托／正襯"), ["襯托", "正襯"])
        self.assertEqual(expand_slash("明喻／比喻"), ["明喻", "比喻"])
        self.assertEqual(expand_slash("疊字／疊詞"), ["疊字", "疊詞"])

    def test_ellipsis(self):
        self.assertEqual(expand_slash("到……盡頭／窮盡"), ["到……盡頭", "到盡頭", "窮盡"])

    def test_shared_lead(self):
        self.assertEqual(expand_slash("這／這個州裡"), ["這州裡", "這個州裡"])
        self.assertIn("有特別形態的山峰", expand_slash("有特別形態的山峰／山水"))
        self.assertIn("有特別形態的山水", expand_slash("有特別形態的山峰／山水"))
        self.assertIn("我都遊遍", expand_slash("我都遊遍／遊覽過了")[0] if False else expand_slash("我都遊遍／遊覽過了"))
        self.assertEqual(expand_slash("我都遊遍／遊覽過了"), ["我都遊遍", "我都遊覽過了"])

    def test_three_way(self):
        self.assertEqual(expand_slash("低陷／凹陷／下陷"), ["低陷", "凹陷", "下陷"])
        self.assertEqual(expand_slash("憂愁／恐懼／不安"), ["憂愁", "恐懼", "不安"])

    def test_lead_plus_prefix_alt(self):
        self.assertEqual(
            expand_slash("我以為大概這／這個州裡"),
            ["我以為大概這州裡", "我以為大概這個州裡"],
        )

    def test_clause_and(self):
        got = expand_slash("有的高峻／高聳，有的低陷／凹陷／下陷")
        self.assertIn("有的高峻，有的低陷", got)
        self.assertIn("有的高聳，有的下陷", got)
        self.assertNotIn("有的高峻", got)  # must keep both sides of the comma


if __name__ == "__main__":
    unittest.main()
