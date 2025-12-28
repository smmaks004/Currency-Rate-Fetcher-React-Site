const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const { Readable } = require('node:stream');
const { getAiReadOnlyPool } = require('../db/poolAiReadOnly');

const router = express.Router();




// ==========================================
// 1. CONFIGURATION & CONSTANTS
// ==========================================
const OLLAMA_BASE_URL = (process.env.OLLAMA_BASE_URL).replace(/\/+$/, '');
const DEFAULT_MODEL = process.env.OLLAMA_MODEL;
const TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS);

const EN_MONTHS = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12
};

const LV_MONTH_STEMS = {
  'janvār': 1, 'februār': 2, 'mart': 3, 'aprīl': 4, 'maij': 5, 'jūnij': 6,
  'jūlij': 7, 'august': 8, 'septembr': 9, 'oktobr': 10, 'novembr': 11, 'decembr': 12
};






// ==========================================
// 2. HELPER FUNCTIONS (Utils)
// ==========================================
const toStringSafe = (v) => (typeof v === 'string' ? v : v == null ? '' : String(v));
const isIsoDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s);

// Format a DB/Date value to local YYYY-MM-DD without shifting via UTC
const formatDateToIsoLocal = (val) => {
  if (val == null) return null;
  const d = (val instanceof Date) ? val : new Date(val);
  if (!Number.isFinite(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};
const stripCodeFences = (s) => {
  const text = toStringSafe(s).trim();
  if (!text.startsWith('```')) return text;
  return text.replace(/^```[a-zA-Z]*\s*/m, '').replace(/\s*```$/m, '').trim();
};

const tryParseJsonObject = (s) => {
  const t = stripCodeFences(s);
  if (!t.startsWith('{') || !t.endsWith('}')) return null;
  try {
    const obj = JSON.parse(t);
    return obj && typeof obj === 'object' && !Array.isArray(obj) ? obj : null;
  } catch {
    return null;
  }
};

const normalizeCurrencyCode = (s) => {
  const t = toStringSafe(s).trim().toUpperCase();
  return t.length === 3 ? t : null;
};

const escapeRegExp = (s) => toStringSafe(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Normalize text for stable matching against CurrencyName
const normalizeForNameMatch = (s) => {
  return toStringSafe(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
};

// Language Detection
const detectLanguage = (text) => {
  const t = toStringSafe(text);
  // Latvian specific chars
  if (/[āēīūčģķļņšžĀĒĪŪČĢĶĻŅŠŽ]/.test(t)) return 'lv';

  // Latvian common words without diacritics (practical heuristic)
  const low = t.toLowerCase();
  if (/(\blabrit\b|\blabdien\b|\blabvakar\b|\bsveiki\b|\bpaldies\b|\bludzu\b|\bludz\b)/.test(low)) return 'lv';
  return 'en';
};

const languageName = (lang) => (lang === 'lv' ? 'Latvian' : 'English');

// Greeting-only fast path (avoids low-quality model output for simple greetings)
const isGreetingOnly = (text) => {
  const t = toStringSafe(text).trim().toLowerCase();
  return /^((hi|hello|hey)|((labrit|labr\u012bt|labdien|labvakar|sveiki)))[!.?]*$/.test(t);
};

const greetingResponse = (lang) => {
  if (lang === 'lv') return 'Labrīt! Kā varu palīdzēt?';
  return 'Hi! How can I help?';
};

// Date Parsing Logic
const resolveLvMonth = (token) => {
  const t = toStringSafe(token).toLowerCase();
  for (const stem of Object.keys(LV_MONTH_STEMS)) {
    if (t.includes(stem)) return LV_MONTH_STEMS[stem];
  }
  return null;
};

const tryExtractDate = (text) => {
  const t = toStringSafe(text);
  
  // 1. ISO YYYY-MM-DD
  const iso = t.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (iso) return iso[1];

  // 2. DD.MM.YYYY
  const dm = t.match(/\b(\d{1,2})\.(\d{1,2})\.(\d{4})\b/);
  if (dm) {
    return `${dm[3]}-${String(dm[2]).padStart(2, '0')}-${String(dm[1]).padStart(2, '0')}`;
  }

  const low = t.toLowerCase();

  // 3. English Formats
  // "1 January 2025" or "January 1, 2025"
  const enDmy = low.match(/\b(\d{1,2})\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})\b/);
  if (enDmy) {
    return `${enDmy[3]}-${String(EN_MONTHS[enDmy[2]]).padStart(2, '0')}-${String(enDmy[1]).padStart(2, '0')}`;
  }
  
  const enMdy = low.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?\s*,?\s*(\d{4})\b/);
  if (enMdy) {
    return `${enMdy[3]}-${String(EN_MONTHS[enMdy[1]]).padStart(2, '0')}-${String(enMdy[2]).padStart(2, '0')}`;
  }

  // 4. Latvian Formats
  // "2025. gada 1. janvārī"
  const lvYdm = low.match(/\b(\d{4})\.?\s*gada\s+(\d{1,2})\.?\s+([a-zāēīūčģķļņšž]+)\b/);
  if (lvYdm) {
    const month = resolveLvMonth(lvYdm[3]);
    if (month) return `${lvYdm[1]}-${String(month).padStart(2, '0')}-${String(lvYdm[2]).padStart(2, '0')}`;
  }

  const lvDmy = low.match(/\b(\d{1,2})\.?\s+([a-zāēīūčģķļņšž]+)\s+(\d{4})\b/);
  if (lvDmy) {
    const month = resolveLvMonth(lvDmy[2]);
    if (month) return `${lvDmy[3]}-${String(month).padStart(2, '0')}-${String(lvDmy[1]).padStart(2, '0')}`;
  }

  return null;
};

// Intent Extraction (Heuristic)
const tryExtractPairRateQuery = async (text) => {
  const t = toStringSafe(text);
  const date = tryExtractDate(t);
  if (!date) return null;

  // Search for 3-letter uppercase codes
  const codes = Array.from(t.matchAll(/(^|[^A-Za-z])([A-Z]{3})(?=[^A-Za-z]|$)/g)).map(m => m[2]);
  const uniqueCodes = [...new Set(codes)];
  if (uniqueCodes.length >= 2) {
    return { from: uniqueCodes[0], to: uniqueCodes[1], date, exact: 0 };
  }

  // Fallback: match CurrencyName from DB
  const byName = await findCurrencyCodesByNameInText(t);
  if (byName.length >= 2) {
    return { from: byName[0], to: byName[1], date, exact: 0 };
  }

  return null;
};

// Request Validation Helper
const validateChatRequest = (req) => {
  const model = toStringSafe(req.body?.model).trim() || DEFAULT_MODEL;
  const clientMessages = Array.isArray(req.body?.messages) ? req.body.messages : null;
  const singleMessage = toStringSafe(req.body?.message).trim();

  const rawMessages = clientMessages || (singleMessage ? [{ role: 'user', content: singleMessage }] : []);
  
  if (!rawMessages.length) throw new Error('Provide `message` or `messages`.');
  if (rawMessages.length > 50) throw new Error('Too many messages (max 50).');

  const normalized = [];
  for (const m of rawMessages) {
    const role = toStringSafe(m?.role).trim();
    const content = toStringSafe(m?.content).trim();
    if (['system', 'user', 'assistant'].includes(role) && content) {
      normalized.push({ role, content });
    }
  }

  if (!normalized.length) throw new Error('No valid messages after validation.');

  const lastUser = [...normalized].reverse().find(m => m.role === 'user');
  const lang = detectLanguage(lastUser?.content);

  return { model, messages: normalized, lastUser, lang };
};






// ==========================================
// 3. DATABASE & MATH LOGIC
// ==========================================
const CURRENCY_CATALOG_TTL_MS = Number(process.env.AI_CURRENCY_CATALOG_TTL_MS) || 10 * 60 * 1000;
let currencyCatalogCache = {
  fetchedAt: 0,
  byCode: new Map(),
  list: []
};

const fetchCurrencyCatalog = async () => {
  const pool = getAiReadOnlyPool();
  const [rows] = await pool.query('SELECT Id, CurrencyCode, CurrencyName FROM Currencies');

  const byCode = new Map();
  const list = [];

  for (const r of rows || []) {
    const code = normalizeCurrencyCode(r?.CurrencyCode);
    const id = r?.Id != null ? Number(r.Id) : null;
    const name = toStringSafe(r?.CurrencyName).trim();
    if (!code || !Number.isFinite(id) || id <= 0) continue;

    const nameNorm = normalizeForNameMatch(name);
    const namePattern = nameNorm
      ? new RegExp(`\\b${nameNorm.split(' ').map(escapeRegExp).join('\\s+')}\\b`, 'i')
      : null;

    const info = { id, code, name: name || null, nameNorm, namePattern };
    byCode.set(code, info);
    list.push(info);
  }

  return { fetchedAt: Date.now(), byCode, list };
};

const getCurrencyCatalog = async ({ forceRefresh = false } = {}) => {
  const now = Date.now();
  const stale = !currencyCatalogCache.fetchedAt || (now - currencyCatalogCache.fetchedAt) > CURRENCY_CATALOG_TTL_MS;
  if (forceRefresh || stale || currencyCatalogCache.byCode.size === 0) {
    currencyCatalogCache = await fetchCurrencyCatalog();
  }
  return currencyCatalogCache;
};

const getCurrencyInfoByCode = async (code) => {
  const c = normalizeCurrencyCode(code);
  if (!c) return null;
  const catalog = await getCurrencyCatalog();
  return catalog.byCode.get(c) || null;
};

const findCurrencyCodesByNameInText = async (text) => {
  const normalizedText = normalizeForNameMatch(text);
  if (!normalizedText) return [];

  const catalog = await getCurrencyCatalog();
  const hits = [];

  for (const cur of catalog.list) {
    if (!cur?.namePattern) continue;
    const m = cur.namePattern.exec(normalizedText);
    if (m) hits.push({ code: cur.code, index: m.index });
  }

  hits.sort((a, b) => a.index - b.index);
  const unique = [];
  const seen = new Set();
  for (const h of hits) {
    if (seen.has(h.code)) continue;
    seen.add(h.code);
    unique.push(h.code);
  }
  return unique;
};

const calculatePairRates = (baseTo, baseFrom, marginTo = 0, marginFrom = 0) => {
  const bt = Number(baseTo);
  const bf = Number(baseFrom);
  if (!Number.isFinite(bt) || !Number.isFinite(bf) || bt <= 0 || bf <= 0) {
    return { originRate: null, buyRate: null, sellRate: null };
  }

  const mTo = Number(marginTo) || 0;
  const mFrom = Number(marginFrom) || 0;
  const origin = bt / bf;

  if (mTo === mFrom) {
    const half = mTo / 2;
    const multiplier = (1 + half) / (1 - half);
    return {
      originRate: Number(origin),
      buyRate: Number(origin * multiplier),
      sellRate: Number(origin / multiplier)
    };
  }

  const eurTo_sell = bt * (1 + mTo / 2);
  const eurFrom_buy = bf * (1 - mFrom / 2);
  const buy = eurTo_sell / eurFrom_buy;

  const eurTo_buy = bt * (1 - mTo / 2);
  const eurFrom_sell = bf * (1 + mFrom / 2);
  const sell = eurTo_buy / eurFrom_sell;

  return { originRate: Number(origin), buyRate: Number(buy), sellRate: Number(sell) };
};

const getCurrencyIdByCode = async (code) => {
  const info = await getCurrencyInfoByCode(code);
  return info?.id ?? null;
};

const getEurToCurrencyRateOnDate = async (toCurrencyId, date, { exact = false } = {}) => {
  const pool = getAiReadOnlyPool();
  const sql = exact
    ? `SELECT cr.ExchangeRate, cr.Date, m.MarginValue FROM CurrencyRates cr LEFT JOIN Margins m ON m.Id = cr.MarginId WHERE cr.ToCurrencyId = ? AND DATE(cr.Date) = ? ORDER BY cr.Date DESC LIMIT 1`
    : `SELECT cr.ExchangeRate, cr.Date, m.MarginValue FROM CurrencyRates cr LEFT JOIN Margins m ON m.Id = cr.MarginId WHERE cr.ToCurrencyId = ? AND cr.Date < DATE_ADD(?, INTERVAL 1 DAY) ORDER BY cr.Date DESC LIMIT 1`;

  const [rows] = await pool.query(sql, [toCurrencyId, date]);
  if (!rows?.[0]) return null;
  
  const rate = Number(rows[0].ExchangeRate);
  if (!Number.isFinite(rate)) return null;
  
  const mv = rows[0].MarginValue;
  return { rate, date: rows[0].Date, marginValue: Number.isFinite(Number(mv)) ? Number(mv) : null };
};

const computePairRate = async ({ from, to, date, exact = 0 }) => {
  const fromCode = normalizeCurrencyCode(from);
  const toCode = normalizeCurrencyCode(to);
  if (!fromCode || !toCode) throw Object.assign(new Error('Invalid currency codes'), { statusCode: 400 });

  // Normalize date to ISO so the tool can accept human-friendly inputs too
  const dateRaw = toStringSafe(date).trim();
  const dateIso = isIsoDate(dateRaw) ? dateRaw : (tryExtractDate(dateRaw) || null);
  if (!dateIso) throw Object.assign(new Error('Invalid date format. Use YYYY-MM-DD.'), { statusCode: 400 });

  const exactFlag = String(exact) === '1' || exact === true;

  if (fromCode === toCode) {
    // Avoid forcing DB access for the trivial same-currency case
    const sameInfo = fromCode === 'EUR' ? null : await getCurrencyInfoByCode(fromCode);
    return {
      from: fromCode,
      to: toCode,
      fromName: sameInfo?.name ?? null,
      toName: sameInfo?.name ?? null,
      requestedDate: dateIso,
      rate: 1,
      effectiveFromDate: dateIso,
      effectiveToDate: dateIso,
      exact: exactFlag
    };
  }

  const fromInfo = await getCurrencyInfoByCode(fromCode);
  const toInfo = await getCurrencyInfoByCode(toCode);

  const fromId = fromCode === 'EUR' ? null : (fromInfo?.id ?? null);
  const toId = toCode === 'EUR' ? null : (toInfo?.id ?? null);

  if (fromCode !== 'EUR' && !fromId) throw Object.assign(new Error(`Unknown currency: ${fromCode}`), { statusCode: 404 });
  if (toCode !== 'EUR' && !toId) throw Object.assign(new Error(`Unknown currency: ${toCode}`), { statusCode: 404 });

  const fromRow = fromCode === 'EUR' ? { rate: 1, date: dateIso, marginValue: null } : await getEurToCurrencyRateOnDate(fromId, dateIso, { exact: exactFlag });
  const toRow = toCode === 'EUR' ? { rate: 1, date: dateIso, marginValue: null } : await getEurToCurrencyRateOnDate(toId, dateIso, { exact: exactFlag });

  if (!fromRow || !toRow) {
    throw Object.assign(new Error(`No rate found for ${!fromRow ? fromCode : toCode} on/before ${dateIso}`), { statusCode: 404 });
  }

  const effectiveFromDate = fromCode === 'EUR' ? dateIso : formatDateToIsoLocal(fromRow.date);
  const effectiveToDate = toCode === 'EUR' ? dateIso : formatDateToIsoLocal(toRow.date);
  const usedFallback = effectiveFromDate !== dateIso || effectiveToDate !== dateIso;

  const marginTo = toRow.marginValue ?? 0;
  const marginFrom = fromRow.marginValue ?? 0;
  const calc = calculatePairRates(toRow.rate, fromRow.rate, marginTo, marginFrom);

  return {
    from: fromCode, to: toCode, requestedDate: dateIso,
    fromName: fromInfo?.name ?? null,
    toName: toInfo?.name ?? null,
    rate: toRow.rate / fromRow.rate,
    ...calc,
    marginTo, marginFrom, eurToFrom: fromRow.rate, eurToTo: toRow.rate,
    effectiveFromDate, effectiveToDate, usedFallback, exact: exactFlag
  };
};







// ==========================================
// 4. SYSTEM PROMPTS
// ==========================================
const buildToolRouterSystemPrompt = (lang) => {
  const outLang = languageName(lang);
  return [
    `You are an assistant inside a web app. Always respond in the same language as the user's last message (${outLang}).`,
    'You have EXACTLY ONE read-only DB tool for exchange rates: pair-rate.',
    'If the user asks for an exchange rate for a specific date, you MUST respond with ONLY a single JSON object and no other text.',
    'The JSON format must be exactly: {"tool":"pair-rate","args":{"from":"AAA","to":"BBB","date":"YYYY-MM-DD","exact":0}}.',
    'If the user provides the date in another format (e.g. "November 1, 2025" or "01.11.2025"), you MUST convert it to ISO YYYY-MM-DD in the JSON.',
    'Even if the date is in the future, still call the tool (the DB may or may not have data).',
    'from and to MUST be 3-letter currency codes (e.g. EUR, USD, AUD).',
    'exact: 1 = strictly on that date, 0 = allow closest rate on or before the date.',
    'If the user is NOT asking for a dated exchange rate, answer normally in the user language and DO NOT output JSON.'
  ].join(' ');
};

const buildFinalAnswerSystemPrompt = (lang) => {
  const outLang = languageName(lang);
  return [
    `You are an assistant inside a web app. Always respond in the same language as the user's last message (${outLang}).`,
    'You may receive tool data as TOOL_RESULT JSON.',
    'If TOOL_RESULT is present, you MUST base your answer ONLY on it and you MUST NOT guess.',
    'If TOOL_RESULT is NOT present, answer normally based on the conversation (do not mention TOOL_RESULT or tools).',
    'Never say you cannot access external information, browsing, databases, or tool results. You are inside the app and must just answer.',
    'Never claim you cannot provide rates because they are "future" or because you lack "real-time market data". If data is missing, say the database has no record for that date/pair.',
    'Always include: requestedDate, effectiveFromDate, effectiveToDate, and the computed rate when TOOL_RESULT is present.',
    /**/'When TOOL_RESULT contains originRate, buyRate, or sellRate, present them clearly labeled as: "ECB Rate" (originRate), "Buy Rate" (buyRate) and "Sell Rate" (sellRate).', ///
    /**/'Do NOT show formulas; display only the numeric rates. You may also show the margin value (`marginTo` or `marginFrom`) if relevant.', ///
    /**/'If TOOL_RESULT shows that requestedDate and effectiveFromDate/effectiveToDate are the same, do NOT repeat them; present a single concise date line (for example: "Date: YYYY-MM-DD") instead of separate "Requested date"/"Effective date" lines.', ///
    /**/'Do NOT prepend a standalone date header such as "Date: ..." before the main answer. Start directly with the main sentence that states the rate (for example: "The euro to dollar exchange rate on 2025-08-08 was 1.1648.").', ///
    'If TOOL_RESULT contains originRate/buyRate/sellRate, use them when the user asks for buy/sell/margin rates.',
    'If usedFallback is true, say clearly that there was no DB record on the requested date and the closest previous date was used (use the effective dates from TOOL_RESULT).',
    'Do NOT speculate about why the DB is missing data and do NOT claim the dataset ends on some date unless TOOL_RESULT explicitly contains that information.',
    'Do NOT output JSON and do NOT ask the user to run requests manually.'
  ].join(' ');
};






// ==========================================
// 5. STREAMING UTILS
// ==========================================
const pipeOllamaStream = async (expressRes, upstreamRes) => {
  if (!upstreamRes.ok) {
    const errText = await upstreamRes.text().catch(() => '');
    expressRes.write(JSON.stringify({ error: 'Ollama upstream error', status: upstreamRes.status, details: errText, done: true }) + '\n');
    return expressRes.end();
  }
  if (!upstreamRes.body) {
    expressRes.write(JSON.stringify({ error: 'Ollama stream unavailable', done: true }) + '\n');
    return expressRes.end();
  }

  let buffer = '';
  const nodeStream = Readable.fromWeb(upstreamRes.body);
  
  for await (const chunk of nodeStream) {
    buffer += chunk.toString('utf8');
    while (true) {
      const idx = buffer.indexOf('\n');
      if (idx === -1) break;
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line) continue;
      
      let obj;
      try { obj = JSON.parse(line); } catch { continue; }
      
      const delta = obj?.message?.content ?? obj?.response ?? '';
      const done = Boolean(obj?.done);
      
      if (delta) expressRes.write(JSON.stringify({ delta, done: false }) + '\n');
      if (done) {
        expressRes.write(JSON.stringify({ done: true }) + '\n');
        return expressRes.end();
      }
    }
  }
  expressRes.write(JSON.stringify({ done: true }) + '\n');
  return expressRes.end();
};

const writeOneShotStreamResponse = (res, text) => {
  if (text) res.write(JSON.stringify({ delta: text, done: false }) + '\n');
  res.write(JSON.stringify({ done: true }) + '\n');
  res.end();
};





// ==========================================
// 6. ROUTES
// ==========================================

// Tool Endpoint
router.get('/tools/pair-rate', protect, async (req, res) => {
  try {
    const from = toStringSafe(req.query?.from);
    const to = toStringSafe(req.query?.to);
    const date = toStringSafe(req.query?.date);
    const exact = toStringSafe(req.query?.exact).trim() === '1';

    if (!from || !to || !date) return res.status(400).json({ error: 'Required: from, to, date' });
    
    const result = await computePairRate({ from, to, date, exact: exact ? 1 : 0 });
    return res.json(result);
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({ error: err.message || 'Tool failed' });
  }
});



// Non-streaming Chat
router.post('/chat', protect, async (req, res) => {
  try {
    const { model, messages, lang } = validateChatRequest(req);

    // If the last user message is a pure greeting, reply directly
    const lastUser = [...messages].reverse().find(m => m.role === 'user');
    if (lastUser && isGreetingOnly(lastUser.content)) {
      return res.json({ model, message: greetingResponse(lang), raw: null });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const sys = buildFinalAnswerSystemPrompt(lang);
      const upstreamRes = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages: [{ role: 'system', content: sys }, ...messages], stream: false }),
        signal: controller.signal
      });

      const data = await upstreamRes.json();
      if (!upstreamRes.ok) throw new Error(JSON.stringify(data));

      return res.json({
        model: data?.model || model,
        message: data?.message?.content ?? data?.response ?? '',
        raw: data
      });
    } finally {
      clearTimeout(timeout);
    }
  } catch (err) {
    const isAbort = err.name === 'AbortError';
    return res.status(isAbort ? 504 : 500).json({ error: isAbort ? 'Timeout' : 'Failed', details: err.message });
  }
});



// Streaming Chat (The Smart One)
router.post('/chat-stream', protect, async (req, res) => {
  let controller = null;
  let timeout = null;

  try {
    const { model, messages, lastUser, lang } = validateChatRequest(req);

    // If the last user message is a pure greeting, reply directly
    if (lastUser && isGreetingOnly(lastUser.content)) {
      res.writeHead(200, {
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      });
      return writeOneShotStreamResponse(res, greetingResponse(lang));
    }

    // Setup headers
    res.writeHead(200, {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });

    controller = new AbortController();
    timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    
    req.on('close', () => { clearTimeout(timeout); controller.abort(); });

    // Helper to generate final streamed answer from model
    const generateFinalAnswer = async (toolResult = null) => {
      const sysFinal = buildFinalAnswerSystemPrompt(lang);
      const finalMsgs = [{ role: 'system', content: sysFinal }, ...messages];
      
      if (toolResult) {
        finalMsgs.push({ role: 'system', content: `TOOL_RESULT: ${JSON.stringify(toolResult)}` });
      }

      const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages: finalMsgs, stream: true }),
        signal: controller.signal
      });
      return pipeOllamaStream(res, response);
    };

    // Strategy 1: Heuristic Check (Regex)
    const extracted = await tryExtractPairRateQuery(lastUser.content);
    if (extracted) {
      try {
        const result = await computePairRate(extracted);
        return await generateFinalAnswer(result);
      } catch (e) {
        // If heuristic tool execution failed, fall through to Strategy 2
      }
    }


    // Strategy 2: Ask Model (Router)
    const sysRouter = buildToolRouterSystemPrompt(lang);
    const routerRes = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages: [{ role: 'system', content: sysRouter }, ...messages], stream: false }),
      signal: controller.signal
    });

    if (!routerRes.ok) {
      return writeOneShotStreamResponse(res, lang === 'lv' ? 'Kļūda modelī.' : 'Model error.');
    }

    const routerData = await routerRes.json();
    const routerMsg = routerData?.message?.content || '';
    const maybeTool = tryParseJsonObject(routerMsg);

    if (maybeTool?.tool === 'pair-rate') {
      try {
        const args = maybeTool.args || {};
        const result = await computePairRate({ 
          from: args.from, to: args.to, date: args.date, exact: args.exact 
        });
        return await generateFinalAnswer(result);
      } catch (e) {
        // If tool fails, let model explain or apologize in final answer (passed as null result)
        // Or simply failover to standard chat
      }
    }

    // Strategy 3: Standard Chat (No Tool)
    return await generateFinalAnswer(null);


  } catch (err) {
    if (timeout) clearTimeout(timeout);
    const isAbort = err.name === 'AbortError';
    if (!res.headersSent) res.status(500);
    res.write(JSON.stringify({ error: isAbort ? 'Timeout' : 'Server error', details: err.message, done: true }) + '\n');
    res.end();
  }
});



module.exports = router;