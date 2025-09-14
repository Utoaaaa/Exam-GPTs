# Google Sheet 記錄格式（依年分分頁）

- 工作表分頁：以年分命名，例如 `108`、`109`、…、`113`，各年一個工作頁面。
- 欄位（第 1 列為標題，固定不變）：
  - Timestamp: 作答時間（由 Apps Script `appendRow` 寫入）
  - Subject: 科別/科目（如：國文、數學、英文…）
  - QuestionId: 題號（對應題庫 `id`，內含年分，如 `Q-108-...`）
  - Chosen: 學員作答選項代號（如 A/B/C/D；空字串表示未填）
  - IsCorrect: TRUE/FALSE（最新狀態以最後一次作答為準）
  - Explanation: 詳解（正確或錯誤皆可記錄）

查詢規則：
- 已作答題：相同 `QuestionId` 在任一年分工作表中出現過即視為已作答；「最新一次」為最末筆紀錄。
- 錯題清單：同上，取「最新一次」為錯誤的題號集合。

與 GPTs Actions 的使用對應：
- 出題前：POST `/`，`{ action: "filterUnanswered", subject?, questionIds: [候選ID] }` → 回傳 `unansweredQuestionIds`。
- 判分寫回：POST `/`，`{ action: "record", year_roc, subject, questionId, chosen, isCorrect, explanation? }`（year_roc 為寫入目標年分分頁，如 108~113；亦相容舊欄位 year）。
- 取曾錯題：GET `/?action=wrong&subject=...` → 回傳 `wrongQuestionIds`。

備註：
- 本專案不使用 apiKey；Apps Script 已開放不驗證；不使用 UserId（單人模式）。
- 同一題可重複作答，表中會新增多筆，分析時以最後一筆為準。
