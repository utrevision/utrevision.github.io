# 文言溫習小測 Web — requirements

Firebase project: wenyan-quiz-web
Web appId: 1:215594347562:web:4a677dd40180c7a480e753
Public site: https://utrevision.github.io/ (GitHub Pages; Firebase Hosting is not used)

Quizzes (JSON attached as uploads):
- lianpo: 66 items — 《廉頗藺相如列傳》溫習小測（甲部）
- 8passages: 100 items — 指定文言八篇溫習小測（甲部）

Each item: { stem, target, answers[] }
Mark correct if student answer matches any answers[] after trim; accept full-width/half-width slash variants; prefer exact match on any alternate gloss.

Product:
- Two routes/pages (or home picker): one quiz each
- Shuffle item order on every fresh attempt / page load
- Google Sign-In required before starting
- Multiple attempts allowed (new attempt = new shuffle + new timer)
- On complete all items: show hit rate (% correct) and elapsed time
- Leaderboard per quiz: best or latest? Prefer show table of attempts ranked by hit rate desc then time asc; store uid, displayName, quizId, score, total, hitRate, durationMs, finishedAt
- Traditional Chinese UI
- Public site is GitHub Pages at https://utrevision.github.io/ (Vite base `/`). Do not deploy Firebase Hosting. Keep Firebase Auth + Firestore.

Answer UX: show stem with target bold if possible; input for 語譯; submit per question or next; progress N/M.
