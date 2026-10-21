# 文言溫習小測 Web — requirements

Firebase project: wenyan-quiz-web
Web appId: 1:215594347562:web:4a677dd40180c7a480e753
Public site: https://utrevision.github.io/ (GitHub Pages; Firebase Hosting is not used)

Quizzes (JSON attached as uploads):
- lianpo: 65 items — 《廉頗藺相如列傳》溫習小測（語譯）
- 8passages: 100 items — 指定文言八篇溫習小測（語譯）

Each item: { stem, target, answers[] }
Mark correct if student answer matches any answers[] after trim; accept full-width/half-width slash variants; prefer exact match on any alternate gloss.

Product:
- Two routes/pages (or home picker): one quiz each
- Shuffle item order on every fresh attempt / page load
- Google Sign-In required before starting
- Multiple attempts allowed (new attempt = new shuffle + new timer). Leaderboard keeps only the best per user per quiz: higher score wins; the same score keeps the shorter time. A better attempt overwrites the stored row.
- On each question, show only the suggested answer. Do not show a per-question score and do not call the model. Batch-grade once after the last question.
- On complete all items: show hit rate (% correct) and elapsed time
- Leaderboard per quiz: one row per user, ranked by score desc, then hit rate desc, then time asc; store uid, displayName, quizId, score, total, hitRate, durationMs, finishedAt. The signed-in user can delete their own row after two confirms. lianpo total is 65; 8passages total is 100.
- Traditional Chinese UI
- Public site is GitHub Pages at https://utrevision.github.io/ (Vite base `/`). Do not deploy Firebase Hosting. Keep Firebase Auth + Firestore.

Answer UX: show stem with target bold if possible; input for 語譯; submit per question or next; progress N/M.
