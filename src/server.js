// WorkFuel: Telegram bot + Mini App backend. Zero dependencies, Node 20+.
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildReport, isYmd, MAX_DAYS } from './report.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ---------- env ----------
function loadDotEnv() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
loadDotEnv();

const TOKEN = process.env.BOT_TOKEN;
const WEBAPP_URL = process.env.WEBAPP_URL;
const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = path.resolve(ROOT, process.env.DATA_DIR || 'data');
const DEV_USER_ID = process.env.DEV_USER_ID ? Number(process.env.DEV_USER_ID) : null;
const PUBLIC_DIR = path.join(ROOT, 'public');
const USERS_DIR = path.join(DATA_DIR, 'users');

if (!TOKEN) { console.error('BOT_TOKEN is not set'); process.exit(1); }
if (!WEBAPP_URL) console.warn('WEBAPP_URL is not set: bot will not show the app button');
fs.mkdirSync(USERS_DIR, { recursive: true });

// ---------- storage (one JSON file per Telegram user) ----------
const userFile = id => path.join(USERS_DIR, `${Number(id)}.json`);
function loadUser(id) {
  try { return JSON.parse(fs.readFileSync(userFile(id), 'utf8')); } catch { return null; }
}
function saveUser(id, data) {
  const file = userFile(id), tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data));
  fs.renameSync(tmp, file);
}
function updateUser(id, patch) {
  const u = loadUser(id) || { profile: { id: Number(id), createdAt: new Date().toISOString() }, state: null };
  patch(u);
  saveUser(id, u);
  return u;
}
const isRegistered = u => !!(u && u.profile.phone && u.profile.lang);

// ---------- Telegram Bot API ----------
async function tg(method, params = {}) {
  try {
    const r = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(params),
    });
    const j = await r.json();
    if (!j.ok) console.error(`[tg] ${method}: ${j.description}`);
    return j.ok ? j.result : null;
  } catch (e) {
    console.error(`[tg] ${method}: ${e.message}`);
    return null;
  }
}

const T = {
  askPhone:
    "Assalomu alaykum! <b>WorkFuel</b> botiga xush kelibsiz.\nDavom etish uchun pastdagi tugma orqali telefon raqamingizni yuboring 👇\n\n" +
    'Здравствуйте! Добро пожаловать в <b>WorkFuel</b>.\nЧтобы продолжить, отправьте номер телефона кнопкой ниже 👇',
  phoneBtn: "📱 Raqamni yuborish / Отправить номер",
  notOwn: "Iltimos, o'zingizning raqamingizni tugma orqali yuboring.\nПожалуйста, отправьте свой номер кнопкой.",
  phoneOk: '✅ Raqam qabul qilindi / Номер получен',
  askLang: 'Tilni tanlang / Выберите язык:',
  uz: {
    ready: "✅ Tayyor!\n\nWorkFuel ilovasini oching: avval texnikangizni qo'shing (bak sig'imi, soatiga sarf), keyin ish vaqti va yonilg'i sarfini yozib boring.",
    open: '🚜 Ilovani ochish',
    menu: 'WorkFuel',
    langSet: "Til: O'zbekcha",
  },
  ru: {
    ready: '✅ Готово!\n\nОткройте приложение WorkFuel: сначала добавьте технику (объём бака, расход в час), затем записывайте время работы и расход топлива.',
    open: '🚜 Открыть приложение',
    menu: 'WorkFuel',
    langSet: 'Язык: Русский',
  },
};

const langKeyboard = {
  inline_keyboard: [[
    { text: "🇺🇿 O'zbekcha", callback_data: 'lang:uz' },
    { text: '🇷🇺 Русский', callback_data: 'lang:ru' },
  ]],
};

function askPhone(chatId) {
  return tg('sendMessage', {
    chat_id: chatId,
    text: T.askPhone,
    parse_mode: 'HTML',
    reply_markup: {
      keyboard: [[{ text: T.phoneBtn, request_contact: true }]],
      resize_keyboard: true,
      one_time_keyboard: true,
    },
  });
}

async function sendApp(chatId, lang) {
  const L = T[lang] || T.uz;
  if (!WEBAPP_URL) return tg('sendMessage', { chat_id: chatId, text: L.ready });
  await tg('setChatMenuButton', {
    chat_id: chatId,
    menu_button: { type: 'web_app', text: L.menu, web_app: { url: WEBAPP_URL } },
  });
  return tg('sendMessage', {
    chat_id: chatId,
    text: L.ready,
    reply_markup: { inline_keyboard: [[{ text: L.open, web_app: { url: WEBAPP_URL } }]] },
  });
}

async function onMessage(msg) {
  if (msg.chat.type !== 'private' || !msg.from) return;
  const chatId = msg.chat.id, uid = msg.from.id;
  const text = (msg.text || '').trim();
  let u = loadUser(uid);

  if (msg.contact) {
    if (msg.contact.user_id !== uid) {
      await tg('sendMessage', { chat_id: chatId, text: T.notOwn });
      return askPhone(chatId);
    }
    u = updateUser(uid, x => {
      x.profile.phone = msg.contact.phone_number.replace(/^(?!\+)/, '+');
      x.profile.first_name = msg.from.first_name || '';
      x.profile.last_name = msg.from.last_name || '';
      x.profile.username = msg.from.username || '';
    });
    await tg('sendMessage', { chat_id: chatId, text: T.phoneOk, reply_markup: { remove_keyboard: true } });
    if (u.profile.lang) return sendApp(chatId, u.profile.lang);
    return tg('sendMessage', { chat_id: chatId, text: T.askLang, reply_markup: langKeyboard });
  }

  if (text === '/lang' || text.startsWith('/lang@')) {
    return tg('sendMessage', { chat_id: chatId, text: T.askLang, reply_markup: langKeyboard });
  }

  // /start and anything else: continue onboarding from where the user stopped.
  if (!u || !u.profile.phone) return askPhone(chatId);
  if (!u.profile.lang) return tg('sendMessage', { chat_id: chatId, text: T.askLang, reply_markup: langKeyboard });
  return sendApp(chatId, u.profile.lang);
}

async function onCallback(q) {
  const m = /^lang:(uz|ru)$/.exec(q.data || '');
  if (!m) return tg('answerCallbackQuery', { callback_query_id: q.id });
  const lang = m[1];
  const u = updateUser(q.from.id, x => { x.profile.lang = lang; });
  await tg('answerCallbackQuery', { callback_query_id: q.id, text: T[lang].langSet });
  if (q.message) {
    await tg('editMessageText', { chat_id: q.message.chat.id, message_id: q.message.message_id, text: T[lang].langSet });
  }
  const chatId = q.message ? q.message.chat.id : q.from.id;
  if (!u.profile.phone) return askPhone(chatId);
  return sendApp(chatId, lang);
}

async function poll() {
  await tg('deleteWebhook', { drop_pending_updates: false });
  await tg('setMyCommands', {
    commands: [
      { command: 'start', description: 'Boshlash / Начать' },
      { command: 'lang', description: 'Til / Язык' },
    ],
  });
  const me = await tg('getMe');
  if (me) console.log(`[bot] @${me.username} polling`);
  let offset = 0;
  for (;;) {
    try {
      const r = await fetch(`https://api.telegram.org/bot${TOKEN}/getUpdates`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ offset, timeout: 50, allowed_updates: ['message', 'callback_query'] }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.description);
      for (const upd of j.result) {
        offset = upd.update_id + 1;
        try {
          if (upd.message) await onMessage(upd.message);
          else if (upd.callback_query) await onCallback(upd.callback_query);
        } catch (e) { console.error('[bot] update error', e); }
      }
    } catch (e) {
      console.error('[bot] poll error:', e.message);
      await new Promise(r => setTimeout(r, 3000));
    }
  }
}

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
async function sendDocument(chatId, buffer, filename, caption) {
  try {
    const fd = new FormData();
    fd.append('chat_id', String(chatId));
    fd.append('caption', caption);
    fd.append('document', new Blob([buffer], { type: XLSX_MIME }), filename);
    const r = await fetch(`https://api.telegram.org/bot${TOKEN}/sendDocument`, { method: 'POST', body: fd });
    const j = await r.json();
    if (!j.ok) console.error('[tg] sendDocument:', j.description);
    return j.ok;
  } catch (e) {
    console.error('[tg] sendDocument:', e.message);
    return false;
  }
}

// ---------- Mini App auth (initData HMAC check) ----------
const WEBAPP_SECRET = crypto.createHmac('sha256', 'WebAppData').update(TOKEN).digest();
const MAX_AGE_S = 7 * 24 * 3600;

function checkInitData(initData) {
  if (!initData) return DEV_USER_ID ? { id: DEV_USER_ID, first_name: 'Dev' } : null;
  const p = new URLSearchParams(initData);
  const hash = p.get('hash');
  if (!hash) return null;
  p.delete('hash');
  const dcs = [...p.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => `${k}=${v}`).join('\n');
  const calc = crypto.createHmac('sha256', WEBAPP_SECRET).update(dcs).digest('hex');
  if (calc.length !== hash.length || !crypto.timingSafeEqual(Buffer.from(calc), Buffer.from(hash))) return null;
  if (Date.now() / 1000 - Number(p.get('auth_date')) > MAX_AGE_S) return null;
  try { return JSON.parse(p.get('user')); } catch { return null; }
}

// ---------- HTTP ----------
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json',
};

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function readBody(req, limit = 2 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > limit) { reject(new Error('too_large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch { reject(new Error('bad_json')); } });
    req.on('error', reject);
  });
}

function validState(s) {
  return s && typeof s === 'object' && Array.isArray(s.machines) && Array.isArray(s.sessions) && Array.isArray(s.fills);
}

async function api(req, res, route) {
  const tgUser = checkInitData(req.headers['x-init-data']);
  if (!tgUser || !tgUser.id) return send(res, 401, { error: 'unauthorized' });
  let u = loadUser(tgUser.id);
  if (DEV_USER_ID && tgUser.id === DEV_USER_ID && !isRegistered(u)) {
    u = updateUser(tgUser.id, x => { x.profile.phone ||= '+998000000000'; x.profile.lang ||= 'uz'; });
  }
  if (!isRegistered(u)) return send(res, 403, { error: 'not_registered' });

  if (route === 'POST /api/me') {
    return send(res, 200, { profile: u.profile, state: u.state });
  }
  if (route === 'PUT /api/state') {
    const body = await readBody(req);
    if (!validState(body)) return send(res, 400, { error: 'bad_state' });
    updateUser(tgUser.id, x => { x.state = body; x.updatedAt = new Date().toISOString(); });
    return send(res, 200, { ok: true });
  }
  if (route === 'PUT /api/lang') {
    const { lang } = await readBody(req);
    if (lang !== 'uz' && lang !== 'ru') return send(res, 400, { error: 'bad_lang' });
    updateUser(tgUser.id, x => { x.profile.lang = lang; });
    if (u.profile.lang !== lang) sendApp(tgUser.id, lang);
    return send(res, 200, { ok: true });
  }
  if (route === 'POST /api/export') {
    const { machineId, from, to, tz, deliver } = await readBody(req);
    if (!isYmd(from) || !isYmd(to) || from > to) return send(res, 400, { error: 'bad_range' });
    if ((Date.parse(to) - Date.parse(from)) / 86400000 >= MAX_DAYS) return send(res, 400, { error: 'range_too_long' });
    const state = u.state;
    const machine = validState(state) && state.machines.find(m => m.id === machineId);
    if (!machine) return send(res, 404, { error: 'no_machine' });
    const offset = Number.isFinite(tz) && Math.abs(tz) <= 840 ? tz : 0;
    const rep = buildReport({ state, machine, from, to, tz: offset, lang: u.profile.lang });
    if (deliver === 'download') {
      res.writeHead(200, { 'content-type': XLSX_MIME, 'content-disposition': `attachment; filename="${rep.filename}"`, 'cache-control': 'no-store' });
      return res.end(rep.buffer);
    }
    const ok = await sendDocument(tgUser.id, rep.buffer, rep.filename, rep.caption);
    return send(res, ok ? 200 : 502, { ok });
  }
  return send(res, 404, { error: 'not_found' });
}

function serveStatic(req, res, pathname) {
  const rel = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^\/+/, '');
  const file = path.join(PUBLIC_DIR, rel);
  if (!file.startsWith(PUBLIC_DIR + path.sep)) return send(res, 403, 'Forbidden', 'text/plain');
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, 'Not found', 'text/plain');
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://x');
  try {
    if (pathname === '/health') return send(res, 200, { ok: true });
    if (pathname.startsWith('/api/')) return await api(req, res, `${req.method} ${pathname}`);
    if (req.method === 'GET' || req.method === 'HEAD') return serveStatic(req, res, pathname);
    send(res, 405, { error: 'method_not_allowed' });
  } catch (e) {
    const status = e.message === 'too_large' ? 413 : e.message === 'bad_json' ? 400 : 500;
    if (status === 500) console.error(e);
    send(res, status, { error: e.message });
  }
});

server.listen(PORT, () => console.log(`[http] listening on :${PORT}`));
if (process.env.BOT_POLLING !== '0') poll();
