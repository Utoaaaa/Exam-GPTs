// Each ROC year (108–113) uses its own worksheet tab named by the year string (e.g., '108').
// Records are single-user; no UserId column is used.
const ROC_YEARS = [108, 109, 110, 111, 112, 113];

// ---- Web App Entrypoints ----
function doGet(e) {
  try {
    if (!validateApiKey(e)) return json({ error: 'Unauthorized' }, 401);
    const action = (e.parameter.action || '').toLowerCase();
    const subject = (e.parameter.subject || '').trim();

    if (action === 'health') return json({ ok: true, now: new Date().toISOString() });
    if (!action) return json({ error: 'Missing action' }, 400);

    switch (action) {
      case 'status': {
        const questionId = (e.parameter.questionId || '').trim();
        if (!questionId) return json({ error: 'Missing questionId' }, 400);
        const rec = getLatestForQuestion(questionId);
        if (!rec) return json({ answered: false });
        return json({
          answered: true,
          isCorrect: rec.isCorrect,
          lastResponse: rec
        });
      }
      case 'answered': {
        const ids = getAnsweredQuestionIds(subject || null);
        return json({ answeredQuestionIds: Array.from(ids) });
      }
      case 'wrong': {
        const ids = getWrongQuestionIds(subject || null);
        return json({ wrongQuestionIds: Array.from(ids) });
      }
      default:
        return json({ error: `Unsupported action: ${action}` }, 400);
    }
  } catch (err) {
    return json({ error: String((err && err.message) || err) }, 500);
  }
}

function doPost(e) {
  try {
    const body = parseJsonBody(e);
    if (!validateApiKey(e, body)) return json({ error: 'Unauthorized' }, 401);

    const action = (body.action || '').toLowerCase();
    if (!action) return json({ error: 'Missing action' }, 400);

    switch (action) {
      case 'record': {
        const { subject, questionId, chosen, isCorrect, explanation } = body;
        if (!subject) return json({ error: 'Missing subject' }, 400);
        if (!questionId) return json({ error: 'Missing questionId' }, 400);
        if (typeof isCorrect !== 'boolean') return json({ error: 'Missing or invalid isCorrect' }, 400);

        appendRecord({
          timestamp: new Date(),
          subject: String(subject).trim(),
          questionId: String(questionId).trim(),
          chosen: chosen == null ? '' : String(chosen).trim(),
          isCorrect: !!isCorrect,
          explanation: explanation == null ? '' : String(explanation).trim()
        });
        return json({ ok: true });
      }
      case 'filterunanswered': {
        const { subject, questionIds } = body;
        if (!Array.isArray(questionIds)) return json({ error: 'Missing questionIds[]' }, 400);
        const answered = getAnsweredQuestionIds(subject || null);
        const unanswered = questionIds.filter((id) => !answered.has(String(id)));
        return json({ unansweredQuestionIds: unanswered });
      }
      default:
        return json({ error: `Unsupported action: ${action}` }, 400);
    }
  } catch (err) {
    return json({ error: String((err && err.message) || err) }, 500);
  }
}

// ---- Core Sheet Helpers ----
function getSheetForYear(year) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const name = String(year);
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  ensureHeaders(sheet);
  return sheet;
}

function getYearFromQuestionId(questionId) {
  // Expect pattern like 'Q-108-...'
  const m = String(questionId).match(/Q-(\d{3})-/);
  if (m) {
    const yr = parseInt(m[1], 10);
    if (ROC_YEARS.indexOf(yr) >= 0) return yr;
  }
  // Fallback: try to parse first 3-digit token
  const m2 = String(questionId).match(/(\d{3})/);
  if (m2) {
    const yr2 = parseInt(m2[1], 10);
    if (ROC_YEARS.indexOf(yr2) >= 0) return yr2;
  }
  throw new Error('Cannot determine ROC year from questionId: ' + questionId);
}

function getSheetForQuestionId(questionId) {
  const year = getYearFromQuestionId(questionId);
  return getSheetForYear(year);
}

function ensureHeaders(sheet) {
  const headers = ['Timestamp', 'Subject', 'QuestionId', 'Chosen', 'IsCorrect', 'Explanation'];
  const range = sheet.getRange(1, 1, 1, headers.length);
  const values = range.getValues()[0];
  const needSet = values.some((v, i) => v !== headers[i]);
  if (needSet) {
    range.setValues([headers]);
  }
}

function appendRecord(rec) {
  const sheet = getSheetForQuestionId(rec.questionId);
  sheet.appendRow([
    rec.timestamp,
    rec.subject,
    rec.questionId,
    rec.chosen,
    rec.isCorrect ? 'TRUE' : 'FALSE',
    rec.explanation || ''
  ]);
}

function getAllRowsFromSheet(sheet) {
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const rows = [];
  for (let i = 1; i < values.length; i++) {
    const row = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = values[i][j];
    }
    rows.push(row);
  }
  return rows;
}

function getAllRowsAcrossYears() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let rows = [];
  ROC_YEARS.forEach((yr) => {
    const sheet = ss.getSheetByName(String(yr));
    if (sheet) {
      rows = rows.concat(getAllRowsFromSheet(sheet));
    }
  });
  return rows;
}

function getLatestForQuestion(questionId) {
  const sheet = getSheetForQuestionId(questionId);
  const rows = getAllRowsFromSheet(sheet);
  for (let i = rows.length - 1; i >= 0; i--) {
    const r = rows[i];
    if (String(r.QuestionId) === String(questionId)) {
      return {
        timestamp: r.Timestamp instanceof Date ? r.Timestamp.toISOString() : String(r.Timestamp),
        subject: String(r.Subject || ''),
        questionId: String(r.QuestionId),
        chosen: String(r.Chosen || ''),
        isCorrect: String(r.IsCorrect).toUpperCase() === 'TRUE',
        explanation: String(r.Explanation || '')
      };
    }
  }
  return null;
}

function getAnsweredQuestionIds(subject) {
  const rows = getAllRowsAcrossYears();
  const seen = new Set();
  for (let i = rows.length - 1; i >= 0; i--) {
    const r = rows[i];
    if (subject && String(r.Subject) !== String(subject)) continue;
    const qid = String(r.QuestionId);
    if (!seen.has(qid)) seen.add(qid);
  }
  return seen;
}

function getWrongQuestionIds(subject) {
  const rows = getAllRowsAcrossYears();
  const latest = new Map(); // questionId -> isCorrect (latest)
  for (let i = rows.length - 1; i >= 0; i--) {
    const r = rows[i];
    if (subject && String(r.Subject) !== String(subject)) continue;
    const qid = String(r.QuestionId);
    if (!latest.has(qid)) {
      latest.set(qid, String(r.IsCorrect).toUpperCase() === 'TRUE');
    }
  }
  const wrong = [];
  latest.forEach((isCorrect, qid) => {
    if (!isCorrect) wrong.push(qid);
  });
  return new Set(wrong);
}

// ---- Utilities ----
function parseJsonBody(e) {
  if (!e || !e.postData || !e.postData.contents) return {};
  try {
    return JSON.parse(e.postData.contents);
  } catch (err) {
    throw new Error('Invalid JSON body');
  }
}

function validateApiKey(e, body) {
  // 開放使用：不檢查 API Key
  return true;
}

function json(obj, code) {
  const out = ContentService.createTextOutput(JSON.stringify(obj));
  out.setMimeType(ContentService.MimeType.JSON);
  // Apps Script ContentService 不支援自訂狀態碼/標頭；可忽略 code。
  return out;
}
