# 部署

公開網站：https://utrevision.github.io/

主站是 GitHub Pages（組織專站，Vite `base: '/'`）。Firebase 只保留 Auth（Google）與 Firestore 排行榜，**不要**部署 Firebase Hosting。

## 建置

```bash
npm ci
npm test
npm run build
```

`npm run build` 產出 `dist/`，並複製 `404.html`，讓 `/quiz/...` 這類路徑在 Pages 上仍能開啟單頁應用。

## GitHub Pages

工作流程：`.github/workflows/pages.yml`（推上 `main` 或手動執行）。

Pages 來源必須是 GitHub Actions，而不是從分支直接發佈：

```bash
gh api --method PUT repos/utrevision/utrevision.github.io/pages \
  -H "Accept: application/vnd.github+json" \
  -f build_type=workflow
```

若這個呼叫回 403，請用有 repo 管理權限的帳號到  
https://github.com/utrevision/utrevision.github.io/settings/pages  
把 **Build and deployment / Source** 改成 **GitHub Actions**。

## Firebase 授權網域

專案 `wenyan-quiz-web`。網頁設定已寫在 `src/firebase.ts`（`authDomain` 維持 `wenyan-quiz-web.firebaseapp.com`）。

目前以公開 API 查詢 `getProjectConfig` 會回 `CONFIGURATION_NOT_FOUND`（對應前端 `auth/configuration-not-found`）。這表示 Authentication 尚未在專案裡啟用，不只是授權網域缺漏。此環境沒有 Firebase CLI 登入，無法代為開啟。

請用有權限的帳號到 Firebase Console：

1. 開啟 Authentication（若尚未開始，按 Get started）  
   https://console.firebase.google.com/project/wenyan-quiz-web/authentication
2. Settings → Authorized domains，加入 `utrevision.github.io`  
   https://console.firebase.google.com/project/wenyan-quiz-web/authentication/settings
3. 啟用 Google 供應商  
   https://console.firebase.google.com/project/wenyan-quiz-web/authentication/providers

## Firestore

規則見 `firestore.rules`。只需更新規則時：

```bash
npx firebase-tools deploy --only firestore:rules --project wenyan-quiz-web
```

不要執行 `firebase deploy --only hosting`。

## Firebase AI Logic

同義判斷使用 Gemini Developer API 的免費層，專案維持 Spark 即可，不需要 Blaze，也不要部署 Firebase Hosting。此環境若沒有 Firebase CLI 登入，無法代為開通。請用有 `wenyan-quiz-web` 權限的帳號完成下面幾步。未開通時，網站仍可作答：未命中標準答案的題維持 0 分。逐題送出後只顯示建議答案，不顯示該題得分。

1. 開通 AI Logic，並啟用 Gemini Developer API：

   ```bash
   npx -y firebase-tools@latest login
   npx -y firebase-tools@latest init ailogic --project wenyan-quiz-web
   ```

   或在 Console 開啟 [AI Logic](https://console.firebase.google.com/project/wenyan-quiz-web/ailogic)，按 Get started，Gemini API provider 選 **Gemini Developer API**。不要選需要計費的 Vertex AI／Agent Platform。

2. 2026 年 7 月起，這個流程會對 Firebase AI Logic 強制 [App Check](https://console.firebase.google.com/project/wenyan-quiz-web/appcheck)。沒有憑證的呼叫會失敗。

   - 為這個 Web App 註冊 reCAPTCHA Enterprise。若專案不能用 Enterprise，可改 reCAPTCHA v3。
   - 建置時傳入網站金鑰。GitHub Pages 工作流程讀 repository variable `VITE_APPCHECK_RECAPTCHA_SITE_KEY`。本機寫在 `.env.local`（已由 gitignore 忽略）。
   - 預設提供者是 Enterprise。改用 v3 時再設 `VITE_APPCHECK_PROVIDER=v3`（本機或 repository variable 皆可）。
   - 在 App Check 的 APIs 分頁，對 **Firebase AI Logic** 按 Enforce。
   - 本機除錯：`.env.local` 設 `VITE_APPCHECK_DEBUG_TOKEN=true`。這只在 `npm run dev` 生效。從瀏覽器主控台複製 debug token，到 App Check → Apps → Manage debug tokens 登記。正式站不要設 debug token。

3. 模型名稱在 `src/grading/aiClient.ts` 所用的 `GRADING_MODEL`，目前是 `gemini-3.5-flash-lite`（免費層、穩定版）。若同義判斷需要更準，可改成同屬免費層的 `gemini-3.8-flash`，然後重新建置 Pages。不要改回 Gemini 2.5 或 1.5。

免費層有每分鐘次數上限。65 題與 100 題裡，只有沒對上標準答案或半分答案的題才會呼叫模型。單題等待超過 12 秒就放棄，並維持 0 分。一次判多題時最多 4 路並行。
