# quiz-from-paper

把溫習小測**教師本**轉成 [utrevision](https://utrevision.github.io/) 現有長答卷（LongQuiz）JSON。

腳本位於 `tools/quiz-from-paper/`。GitHub Actions 工作流為 [`.github/workflows/quiz-from-paper.yml`](../../.github/workflows/quiz-from-paper.yml)：轉換作業只經 `workflow_dispatch` 手動跑並上傳 artifact，**不**在 push `main` 時轉換，也**不**呼叫現有的 `pages.yml` 部署作業。不要在本工作流改 `HomePage`、Firestore，或把題庫公開給學生。

## 流程

1. 教師本 `.docx` → 中間 markdown（也可依同一格式轉錄）
2. 中間 markdown → `src/data` 風格的題庫 JSON，並產出核對報告
3. 可選：與人手稿、現有甲部題庫（例如 `8passages.json`）對照，列出差異

腳本**只按卷面**拆「／」與「（n分）／（各n分）」，不發明同義接受項，不把 answers 壓平進 accept1／accept05。

```bash
python3 -m quiz_from_paper convert \
  --input /path/to/teacher.docx \
  --id shide-xishan \
  --out-dir ./out \
  --bank /path/to/8passages.json \
  --compare /path/to/hand.json
```

只從已轉錄的 md 再跑：

```bash
python3 -m quiz_from_paper convert --input ./out/shide-xishan.md --out-dir ./out
```

比較兩份 JSON：

```bash
python3 -m quiz_from_paper diff --script out/a.json --ref hand.json --out out/a.diff.md
```

依賴：Python 3.10+、`python-docx`（只在讀 docx 時需要）。安裝：

```bash
pip install -r tools/quiz-from-paper/requirements.txt
```

在本目錄執行測試：

```bash
python3 -m unittest discover -s tests -v
```

或在儲存庫根目錄：

```bash
PYTHONPATH=tools/quiz-from-paper python3 -m unittest discover -s tools/quiz-from-paper/tests -v
```

依賴本機絕對路徑的 `test_t1653.py` 在 CI 會自動略過（不把教師本或完整題庫稿寫進庫）。

## 中間 markdown

開頭是簡單 YAML 式 front matter（`id`、`title`、`designer`、`timeLimitMin`、`totalMax`、`sourceLabel`），其後按部：

```markdown
# 甲、字詞語譯（10分）

## 甲1（1分）
type: gloss
stem: 自余為僇人
target: 僇
answers: 有罪的／受刑罰的
accept1:
accept05:

## 乙1（3分）
type: sentence_translate
source: 以為凡是州之山水有異態者，皆我有也。
model: 我以為大概這／這個州裡（1分）有特別形態的山峰／山水（1分），我都遊遍／遊覽過了（1分）。

## 丙2（4分）
type: kara_table
prompt: 作者在遊西山前、後，有截然不同的感受，試解釋之。（4分）
given: 時間、引文
answer: 解釋

| 時間 | 引文 | 解釋 |
| --- | --- | --- |
| 遊西山前 | …… | ……（1分）……（1分） |
```

`given`／`answer` 標明表內哪一欄已給、哪一欄要填。長答用 `type: long_points` 加 `model:`。
