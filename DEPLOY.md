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
