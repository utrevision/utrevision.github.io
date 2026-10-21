# 文言溫習小測

公開網站：<https://utrevision.github.io/>

文言語譯小測（繁體中文）。兩套題庫可重複作答；每次開始會打亂題序並重新計時。須以 Google 帳號登入。完成後顯示得分（合計／題數，可含 0.5）與完成時間（mm:ss），並逐題列出對、半分或錯。排行榜每個帳號、每套小測只保留最佳一次。

題庫：

- `src/data/lianpo.json`：《廉頗藺相如列傳》溫習小測（語譯），65 題
- `src/data/8passages.json`：指定文言八篇溫習小測（語譯），100 題
- `src/data/lianpo-longq-2.json`：上學期測驗溫習小測2（長答），卷面 30 分。首頁在中四、語譯小測之下。

批改先對詞義，再看詞性。對上 `answers[]` 或 `accept1[]` 得 1 分；只對上教師寫入的 `accept05[]` 得 0.5 分。比對前會去掉空白、折合全形／半形，並用 OpenCC 把簡體、繁體與簡繁混寫轉成同一簡體形式。

沒有對上上述清單時，才把題幹、標的字、滿分答案、半分清單和學生答案送給 Firebase AI Logic（Gemini Developer API，模型 `gemini-3.5-flash-lite`，免費層）。模型只能建議 0 或 1。提示裡寫的是可遷移的同義規律（近義動詞、同一義項、加綴或換字、使動），不是封閉答案表，所以沒見過的合理同義也可以得 1。詞義不對必須是 0。0.5 分只會來自 `accept05[]` 的字面命中，模型即使輸出 0.5 也會被改成 0。`src/grading/grading-rl.json` 裡教師標成 0 分的例子（例如「即患秦兵之來」的「患」答「禍患」）不會交給模型翻案。教師已核過的一批同義（例如「度」答「估量」）另外寫進 `accept1[]`，字面就能得 1；清單在 `src/grading/synonym-rl.json`。

作答途中送出一題只顯示「建議答案」，不顯示分數，也不會呼叫模型。全部題目完成後，才一次把整份答案送去判分（未命中字面答案的題才呼叫模型，最多 4 路並行）。模型逾時、被拒或尚未開通時，該題維持 0 分。模型若回傳理由，會把該題的 quizId、題幹、標的字、學生答案、0／1 分、理由、uid 與時間寫入 Firestore `aiGradeLogs`；空白答案和字面命中不會寫入。作答仍須先以 Google 帳號登入。開通步驟見 [DEPLOY.md](DEPLOY.md)。

排行榜每個帳號、每套小測只留最佳一次：總分較高會覆寫舊紀錄；總分相同則保留用時較短的一次。較差的新嘗試不會覆寫。自己的那一列可按「刪除紀錄」，並須確認兩次。Firestore 的 `total`：廉頗語譯是 65，八篇是 100，長答小測2是 30（卷面分數，不是題數）。

長答卷一次過顯示全卷，途中不顯示分數。字詞、選擇、背誦、四字和人物形象格用答案清單評分；句子語譯、廉頗具體表現和長答題把各給分點交給 Firebase AI Logic（與語譯同一個 Gemini 模型），模型只回答每點中或不中，程式再把分數加總。0.5 分只會來自教師寫明的部分分（例如四字題的偏差答案）。電子版不扣錯別字。完卷後的結算表列出對、半分或錯，多點題再逐點列出對或錯。

作答中可按「暫停」：題目會隱藏，計時凍結，按「繼續」才恢復。按「中止」並確認後，該次作答結束，不寫入排行榜。

## 登入

作答與排行榜都要先以 Google 帳號登入（`signInWithPopup`，若彈出視窗被封鎖則改為重新導向）。未登入時可以看首頁題庫清單，但不能開始作答，也不能讀取排行榜。

Firebase 專案是 `wenyan-quiz-web`（Auth 與 Firestore）。網站本身由 GitHub Pages 提供，不使用 Firebase Hosting。

若登入失敗，到 Firebase Console 完成這三步（這個環境沒有 Firebase CLI 登入，無法代為修改）：

1. 開啟 [Authentication](https://console.firebase.google.com/project/wenyan-quiz-web/authentication)，若尚未開始，先按 Get started，建立 Authentication。`auth/configuration-not-found` 表示這一步還沒做。
2. 在 [Settings → Authorized domains](https://console.firebase.google.com/project/wenyan-quiz-web/authentication/settings) 加入 `utrevision.github.io`（不要加 `https://`，也不要加路徑）。
3. 在 [Sign-in method](https://console.firebase.google.com/project/wenyan-quiz-web/authentication/providers) 啟用 Google 供應商。

`localhost` 只供本機開發。授權網域是 Firebase Console 的設定，不會隨這個靜態站一起部署。

## 本地執行

```bash
npm ci
npm test
npm run dev
```

開發伺服器：<http://127.0.0.1:43123>

```bash
npm run build
```

靜態檔在 `dist/`。Vite `base` 為 `'/'`，對應組織專站根網址。

## GitHub Pages

推上 `main` 後，`.github/workflows/pages.yml` 會執行測試、建置，並把 `dist/` 部署到 GitHub Pages。Pages 的建置類型須為 **GitHub Actions**。

Firestore 規則在 `firestore.rules`：已登入者可讀 `attempts`；只能建立、更新或刪除自己的 `uid`。`aiGradeLogs` 只允許已登入者建立自己的文件，不能讀取、修改或刪除。規則若需更新，用 Firebase CLI 只部署規則，不要部署 Hosting：

```bash
npx firebase-tools deploy --only firestore:rules --project wenyan-quiz-web
```
