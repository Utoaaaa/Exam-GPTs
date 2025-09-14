// Supported ROC years and unified headers (single-user; no UserId)
const ROC_YEARS = ['108','109','110','111','112','113'];
const HEADERS = ['Timestamp','Subject','QuestionId','Chosen','IsCorrect','Explanation'];

// ---- Web App Entrypoints ----
function doGet(e) {
  try {
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
      case 'record': {
        const subject    = String(e.parameter.subject || '');
        const questionId = String(e.parameter.questionId || '');
        const chosen     = String(e.parameter.chosen || '');
        const explanation= String(e.parameter.explanation || '');
        const isCorrect  = (function(v){ const s=String(v||'').toLowerCase().trim(); return (s==='true'||s==='1'||s==='yes'||s==='y');})(e.parameter.isCorrect);
        let year         = coerceYear(e.parameter.year_roc) || coerceYear(e.parameter.year) || parseYearFromQuestionId(questionId);

        if (!subject) return json({ error: 'Missing subject' }, 400);
        if (!questionId) return json({ error: 'Missing questionId' }, 400);
        if (!year) return json({ error: 'Missing or invalid year_roc (108..113 or parsable from questionId)' }, 400);

        const sh = getSheetForYear(year);
        sh.appendRow([ new Date(), subject, questionId, chosen, isCorrect ? 'TRUE':'FALSE', explanation ]);
        return json({ ok: true, wroteTo: { sheetName: year } });
      }
      case 'filterunanswered': {
        let qids = [];
        if (e.parameters && e.parameters.questionIds) qids = e.parameters.questionIds.map(String);
        else if (e.parameter && e.parameter.questionIds) qids = String(e.parameter.questionIds).split(',').map(s=>s.trim()).filter(Boolean);
        if (!qids.length) return json({ error: 'Missing questionIds[]' }, 400);

        const answered = getAnsweredQuestionIds(subject || null);
        const unanswered = qids.filter(id => !answered.has(String(id)));
        return json({ unansweredQuestionIds: unanswered });
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

    // accept both action and mode for compatibility
    const action = String((body.action == null ? body.mode : body.action) || '').toLowerCase();
    if (!action) return json({ error: 'Missing action' }, 400);

    switch (action) {
      case 'record': {
        const { subject, questionId, chosen, explanation } = body;
        const isCorrect = (function(v){
          if (typeof v === 'boolean') return v;
          const s = String(v).trim().toLowerCase();
          return s === 'true' || s === '1' || s === 'yes' || s === 'y';
        })(body.isCorrect);
        let year = coerceYear(body.year_roc);
        if (!year) year = coerceYear(body.year);
        if (!year) year = parseYearFromQuestionId(questionId);

        if (!subject) return json({ error: 'Missing subject' }, 400);
        if (!questionId) return json({ error: 'Missing questionId' }, 400);
        if (year == null) return json({ error: 'Missing or invalid year_roc (108..113 or parsable from questionId)' }, 400);

        const sh = getSheetForYear(year);
        sh.appendRow([
          new Date(),
          String(subject).trim(),
          String(questionId).trim(),
          chosen == null ? '' : String(chosen).trim(),
          isCorrect ? 'TRUE' : 'FALSE',
          explanation == null ? '' : String(explanation).trim()
        ]);
        return json({ ok: true, wroteTo: { sheetName: year } });
      }
      case 'filterunanswered': {
        const { subject, questionIds } = body;
        if (!Array.isArray(questionIds)) return json({ error: 'Missing questionIds[]' }, 400);
        const answered = getAnsweredQuestionIds(subject || null);
        const unanswered = questionIds.filter((id) => !answered.has(String(id)));
        return json({ unansweredQuestionIds: unanswered });
      }
      // parity with GET for environments that prefer POST
      case 'answered': {
        const subject = body.subject || '';
        const ids = Array.from(getAnsweredQuestionIds(subject || null));
        return json({ answeredQuestionIds: ids });
      }
      case 'wrong': {
        const subject = body.subject || '';
        const ids = Array.from(getWrongQuestionIds(subject || null));
        return json({ wrongQuestionIds: ids });
      }
      default:
        return json({ error: `Unsupported action: ${action}` }, 400);
    }
  } catch (err) {
    return json({ error: String((err && err.message) || err) }, 500);
  }
}

// ---- Spreadsheet + Year Helpers ----
// Active-bound spreadsheet preferred; else open by Script Property SPREADSHEET_ID.
function getSpreadsheet() {
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;
  const props = (typeof PropertiesService !== 'undefined' && PropertiesService.getScriptProperties)
    ? PropertiesService.getScriptProperties() : null;
  const id = props ? props.getProperty('SPREADSHEET_ID') : null;
  if (id) return SpreadsheetApp.openById(String(id));
  throw new Error('No spreadsheet bound. Bind script to a Sheet or set Script Property SPREADSHEET_ID.');
}

// Year parsing: prefer explicit param; else parse 3-digit ROC year from questionId
function coerceYear(v) {
  if (v == null) return null;
  let s = String(v).trim();
  const n = parseInt(s, 10);
  if (!Number.isNaN(n) && ROC_YEARS.includes(String(n))) return String(n);
  const m = s.match(/\b(10[89]|11[0-3])\b/);
  return m && ROC_YEARS.includes(m[1]) ? m[1] : null;
}
function parseYearFromQuestionId(qid) {
  if (!qid) return null;
  const m = String(qid).match(/\b(10[89]|11[0-3])\b/);
  return m ? m[1] : null;
}

function getSheetForYear(yearStr) {
  const ss = getSpreadsheet();
  if (!ROC_YEARS.includes(String(yearStr))) throw new Error('Invalid year: ' + yearStr);
  let sheet = ss.getSheetByName(String(yearStr));
  if (!sheet) sheet = ss.insertSheet(String(yearStr));
  ensureHeaders(sheet);
  return sheet;
}

function ensureHeaders(sheet) {
  const rng = sheet.getRange(1, 1, 1, HEADERS.length);
  const cur = rng.getValues()[0];
  const need = cur.some((v, i) => v !== HEADERS[i]);
  if (need) rng.setValues([HEADERS]);
}

function getAllRowsAcrossYears() {
  const ss = getSpreadsheet();
  const rows = [];
  ROC_YEARS.forEach(y => {
    const sh = ss.getSheetByName(y);
    if (!sh) return;
    ensureHeaders(sh);
    const last = sh.getLastRow();
    if (last < 2) return;
    const data = sh.getRange(2,1,last-1,HEADERS.length).getValues();
    data.forEach(r => rows.push({
      Year: y,
      Timestamp: r[0],
      Subject: r[1],
      QuestionId: r[2],
      Chosen: r[3],
      IsCorrect: r[4],
      Explanation: r[5]
    }));
  });
  return rows;
}

function getLatestForQuestion(questionId) {
  const rows = getAllRowsAcrossYears();
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


function json(obj, code) {
  const out = ContentService.createTextOutput(JSON.stringify(obj));
  out.setMimeType(ContentService.MimeType.JSON);
  // Apps Script ContentService 不支援自訂狀態碼/標頭；可忽略 code。
  return out;
}
