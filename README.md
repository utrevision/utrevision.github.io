# 文言溫習小測

公開網站：<https://utrevision.github.io/>

甲部字詞語譯小測（繁體中文）。兩套題庫可多次作答；每次開始會打亂題序並重新計時。須以 Google 帳號登入。完成後顯示命中率（得分合計／題數，可含 0.5）與完成時間（mm:ss），並寫入 Firestore 排行榜。

題庫：

- `src/data/lianpo.json`：《廉頗藺相如列傳》溫習小測（甲部），66 題
- `src/data/8passages.json`：指定文言八篇溫習小測（甲部），100 題

批改先對詞義，再看詞性。對上 `answers[]` 或 `accept1[]` 得 1 分；只對上教師寫入的 `accept05[]` 得 0.5 分；其餘 0 分。程式不會自行猜測 0.5 分。比對前會去掉空白、折合全形／半形，並用 OpenCC 把簡體、繁體與簡繁混寫轉成同一簡體形式。

## 登入

作答與排行榜都要先以 Google 帳號登入（`signInWithPopup`，若彈出視窗被封鎖則改為重新導向）。未登入時可以看首頁題庫清單，但不能開始作答，也不能讀取排行榜。

Firebase 專案是 `wenyan-quiz-web`（Auth 與 Firestore）。網站本身由 GitHub Pages 提供，不使用 Firebase Hosting。

若登入出現「此網域尚未加入 Firebase 授權網域」：

1. 開啟 [Authentication → Settings](https://console.firebase.google.com/project/wenyan-quiz-web/authentication/settings)
2. 在 **Authorized domains** 加入 `utrevision.github.io`（不要加 `https://`，也不要加路徑）
3. 確認 [Google 供應商](https://console.firebase.google.com/project/wenyan-quiz-web/authentication/providers) 已啟用

`localhost` 只供本機開發。授權網域清單是 Firebase Console 的設定，無法隨這個靜態站一起部署。

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

Firestore 規則在 `firestore.rules`：已登入者可讀 `attempts`；只能建立、更新或刪除自己的 `uid`。規則若需更新，用 Firebase CLI 只部署規則，不要部署 Hosting：

```bash
npx firebase-tools deploy --only firestore:rules --project wenyan-quiz-web
```
