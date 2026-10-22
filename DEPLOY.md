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

`latestAnswers` 每個已登入帳號、每套卷只留最新一次全卷答案，文件 id 是 `{uid}_{quizId}`。學生每次完卷都會覆寫這份文件，即使分數未超過排行榜最佳。`attempts` 仍然只存最佳分數，沒有答案。已登入者可讀全部 `latestAnswers`（與排行榜相同），方便日後批次重改時列出全班；只有本人可建立或更新自己的文件，不能刪除。刪除排行榜一列不會刪走答案。合併這次規則後要先跑上面的部署指令，否則完卷儲存答案會被拒絕。

整數分數寫入 `hitRate` 時，已部署的規則把 `score / total` 當成整數除法（40／65 得到 0，不是 0.615）。客戶端因此改存這個截斷商，半分分數仍存真正的比值，`finishedAt` 仍用 `serverTimestamp()`。語譯卷沿用這個寫法，長答卷的整數分也一樣。倉庫裡的規則另外接受真正的比值（誤差 0.000001 以內）。

長答卷 `lianpo-longq-2` 的 `total` 必須是 30。已部署的舊規則只允許 `lianpo` 和 `8passages`，所以這套卷的排行榜寫入要先部署上面的規則才會成功。語譯卷不依賴這次部署。

## 題目回報

結算頁（語譯 `Settlement`、長答 `LongSettlement`）每一題有「回報題目」。學生必須已登入。成功寫入後，該題在這一次結算變成「已回報」，避免連按。離開或再做一次之後可以再回報。寫入失敗時按鈕保持可按，並在按鈕下顯示短錯誤。電郵失敗不會取消這次回報，只顯示「已回報。電郵暫時未能送出。」

專案維持 **Spark**。不要部署 Firebase Hosting，也不要為了這封信改用 Blaze。客戶端不能存放 Gmail 密碼。做法分兩段：

1. 一律先把回報寫入 Firestore 集合 `questionFlags`（電郵未設定或送出失敗也寫）。
2. 若建置時有 Formspree form id，再由瀏覽器把同一份內容 POST 到 `https://formspree.io/f/<id>`。Formspree 把信送到建立表單時驗證過的信箱。

`questionFlags` 的客戶端規則：已登入者只能**建立**自己的文件（`uid` 必須等於登入者）。不能讀、不能改、不能刪，包括自己的回報。回報裡有答案，不適合像 `attempts` 那樣開放給所有已登入者讀。結算頁的「已回報」只存在這一次頁面狀態。老師在 [Firebase Console](https://console.firebase.google.com/project/wenyan-quiz-web/firestore) 看 `questionFlags`，以及收信。

規則有改過，回報要能寫入就必須部署規則（Pages 工作流程不會代部署）：

```bash
npx firebase-tools deploy --only firestore:rules --project wenyan-quiz-web
```

### 信裡有什麼

主旨：`題目回報｜{小測標題}｜第{題號}題`

內文（純文字）包括：小測標題、`quizId`、題號、題目 id、考查字、題幹、學生答案（空白會寫「（空白）」）、建議答案、按點結果（長答；沒有則為「（無）」）、該題結果和得分（例如 `錯（0／1）`）、學生 `displayName`、`uid`、學生 Google 電郵（沒有則為「（無）」）、完成時間（香港時間）、通知信箱。

語譯卷的題號是這一次結算表上的次序（題目有打亂），信裡會註明以題幹和考查字認題。長答卷的題號是卷面題號。

Firestore 文件欄位與信是同一份整理後的內容，另加 `emailStatus`（`sent`、`failed` 或 `skipped`）、`finishedAt`、`createdAt`。`notifyEmail` 預設是 `lkh81397@gmail.com`。

### 設定 Formspree（一次）

Formspree 的 form id 會進公開的網頁包，它不是 Gmail 密碼，只能用來提交這張表。不要把密碼或私密 API 金鑰寫進倉庫。GitHub 用 **Variables**（不是 Secrets）：Vite 會把 `VITE_*` 嵌進前端，Secrets 也藏不住。

1. 用可以收到 `lkh81397@gmail.com` 的帳號到 [formspree.io](https://formspree.io) 建立表單，收件信箱填 `lkh81397@gmail.com`，並完成 Formspree 寄來的驗證信。
2. 複製端點裡的 id：`https://formspree.io/f/<id>`。
3. 在 GitHub 倉庫 **Settings → Secrets and variables → Actions → Variables** 新增：
   - `VITE_FLAG_FORMSPREE_ID`：上面的 id，或整段 `https://formspree.io/f/<id>`。
   - `VITE_FLAG_NOTIFY_EMAIL`（可選）：寫進信和 Firestore 的通知信箱。留空則用 `lkh81397@gmail.com`。這不會改變 Formspree 的實際收件人；收件人是第 1 步驗證的信箱，請保持同一個地址。
4. 表單設定裡建議限制網域 `utrevision.github.io`（本機再加 `localhost`），並開啟 Formspree 的垃圾信防護。免費額度約每月 50 則；超出後網站仍會把回報寫入 Firestore，`emailStatus` 為 `failed`，學生看到電郵未能送出。
5. 重新跑 GitHub Pages 工作流程（推上 `main`，或手動執行 `.github/workflows/pages.yml`）。只改變數而不重建，網站裡的 id 不會更新。

本機複製 `.env.example` 為 `.env.local`（已被 gitignore）。`.env.local` 不要提交。

未做第 1–5 步時，按鈕和 Firestore 寫入已經可用，只是不會寄信（`emailStatus` 為 `skipped`），學生不會看到錯誤。

Firebase Extension「Trigger Email」要 Blaze，而且要另一套寄信服務。這次不採用，以免離開 Spark。若以後改走那條路，仍應保留 `questionFlags` 這份稽核紀錄。

## Firebase AI Logic（智能判分）

智能判分使用 Gemini Developer API 的免費層，專案維持 Spark 即可，不需要 Blaze，也不要部署 Firebase Hosting。此環境若沒有 Firebase CLI 登入，無法代為開通。請用有 `wenyan-quiz-web` 權限的帳號完成下面幾步。未開通時，網站仍可作答。完成全部題目後一次結算；模型無法判分的題維持 0 分，逐題畫面只顯示建議答案、不顯示分數。

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
