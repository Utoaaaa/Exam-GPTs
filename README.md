# Medical Exam GPTs（108–113 年）

## 這是一個專為醫師國考題目練習設計的 GPT。

**簡介**
- 題庫涵蓋 108～113 年 各科題目。
- 每次出題前會自動檢查答題紀錄，只出 「尚未作答」的題目。
- 作答後立即判分，並提供詳解。
- 可以選擇指定科目、年份，或重練曾經做錯的題目。
- 所有答題紀錄會自動寫回 Google Sheet，方便追蹤進度。

**重點功能**
- 單人模式：不需 Email/學員 ID，無 UserId 欄位。
- 年分分頁儲存：108～113 各一個工作表分頁（分頁名為年分）。
- 一律附詳解：答對/答錯都提供精要說明並寫入記錄。
- 快速續題：判分與詳解後，使用者若輸入任意文字，即直接出下一題；若提出問題，先答覆再續題。
- 錯題重練：可切換為僅出「最近一次作答仍錯誤」的題目。

**專案結構**
- `Exam-GPTs/GPTs/apps-script.gs`：Google Apps Script 後端（讀寫試算表、提供 API）。
- `Exam-GPTs/GPTs/openapi.yaml`：Actions 規格（供自訂 GPT 導入）。
- `Exam-GPTs/GPTs/gpts-prompt.md`：自訂 GPT 的提示詞（行為規則、互動流程）。
- `Exam-GPTs/GPTs/sheet-schema.md`：試算表欄位與使用說明（分年分頁）。
- `Exam-GPTs/Question-Bank/*.json`：108～113 年題庫。

## 後端部署（Google Apps Script）
1) 建立或開啟一份 Google 試算表，複製其網址中的試算表 ID。
- 建議預先建立分頁 `108`、`109`、`110`、`111`、`112`、`113`；若未建立，程式會在首次寫入時自動建立並填上標題列。
- 欄位：`Timestamp | Subject | QuestionId | Chosen | IsCorrect | Explanation`。

2) 在 Apps Script 專案中新增腳本，貼上 `Medical-Exam-GPTs/GPTs/apps-script.gs` 完整內容。
   - 設定「指令碼內容的屬性」（Script Properties）：新增鍵 `SPREADSHEET_ID`，值為步驟 1 的試算表 ID。
   - 或者在檔頭自行加入 `const SPREADSHEET_ID = '...';`（不建議硬編碼到版本控制）。

3) 發佈為網路應用程式（Web App）：
- 新版編輯器：點選「部署」→「管理部署」→「新部署」→ 類型選「網路應用程式」。
- 存取權選擇「任何人皆可存取」。
- 取得部署網址，記下 `/exec` 路徑（例如 `https://script.google.com/macros/s/XXXX/exec`）。

4) 更新 Actions 設定：
- 可直接在自訂 GPT 的 Actions 設定中輸入你的 `/exec` URL。
- 或更新 `Medical-Exam-GPTs/GPTs/openapi.yaml` 的 `servers[0].url` 為你的部署網址。

## 自訂 GPT 設定
- 建立一個新的自訂 GPT。
- 導入 `Exam-GPTs/GPTs/openapi.yaml` 作為 Actions 規格，或在 Actions 介面手動加入 `GET/POST /exec` 對應的參數。
- 將 `Exam-GPTs/GPTs/gpts-prompt.md` 貼入系統提示詞，或整合其要點。
- 題庫使用 `Exam-GPTs/Question-Bank/108.json`～`113.json`（可在提示詞中引導 GPT 讀取並出題）。

## 使用方法（對話流程）
- 選科目：使用者可輸入「心臟內科」等科目，或請 GPT 提供可選清單。
- 出題：系統只會從未作答清單中出題（會先呼叫 `filterUnanswered`）。
- 作答：輸入選項（如「B」或「選 B」）。
- 判分＋詳解：回覆正確性並提供精要詳解（答對也會提供）。即刻寫回紀錄（`record`）。
- 快速續題：判分與詳解後，若使用者輸入任意文字即自動出下一題；若有追問先答覆再出題。
- 重作錯題：輸入「重作錯題」，系統會改用 `wrong` 清單出題。

### 範例對話
- 使用者：`科目：心臟內科`
- 系統：出第 1 題（含題號、題目、選項）
- 使用者：`選 B`
- 系統：判分＋詳解，寫入紀錄；提示「輸入任意文字繼續下一題」
- 使用者：`下一題`（或任意文字）
- 系統：出下一題...
- 使用者：`重作錯題`
- 系統：從錯題清單出題

## API 速覽（無 apiKey、單人模式）
- `GET /exec?action=health` 健康檢查
- `GET /exec?action=status&questionId={id}` 查單題是否作答與最新結果
- `GET /exec?action=answered&subject={科目?}` 取得已作答題目ID集合
- `GET /exec?action=wrong&subject={科目?}` 取得「最新一次仍錯誤」題目ID集合
- `POST /exec`，`{"action":"filterUnanswered","subject":"科目?","questionIds":[...]} → { unansweredQuestionIds: [...] }`
- `POST /exec`，`{"action":"record","subject":"科目","questionId":"...","chosen":"B","isCorrect":true,"explanation":"..."}`
- `POST /exec`（JSON body）：`{"action":"record","year_roc":113,"subject":"科目","questionId":"...","chosen":"B","isCorrect":true,"explanation":"..."}`（year_roc 指定寫入 108～113 的哪個分頁；isCorrect 使用布林值；相容舊欄位 year）

> 備註：系統會優先使用參數 `year_roc`（相容舊欄位 `year`）；若省略，會依 `questionId` 解析 ROC 年分（如 `Q-108-...`）並自動寫入對應分頁。

## 安全與注意事項
- 本專案預設不驗證 apiKey、允許公開存取，請依實際需求調整 Apps Script 的驗證策略。
- 不儲存個資（無 UserId）；請避免在詳解或日誌中寫入 PII。
- 題庫請自行確認版權/授權使用範圍。

## 疑難排解
- 無未作答題可出：嘗試「重作錯題」或更換科目。
- `questionId` 無法判斷年分：請確保題號格式包含 `Q-108-...`/`Q-109-...` 等三位 ROC 年。
- 連線/部署異常：重新部署 Apps Script 並確認 `/exec` URL 已更新到 Actions 設定。
