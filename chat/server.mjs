// Conversational Form 101 onboarding — local prototype server (stage 1).
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import { FIELDS, SECURE, CREDITS, validate, missing, consistency, prune, label, scrub, enumHelp } from './schema.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(here, 'data');
const ORG = { name: process.env.ORG_NAME || 'חברה לדוגמה בע״מ', role: process.env.ORG_ROLE || 'עובד/ת' };
const client = new Anthropic();
await fs.mkdir(DATA, { recursive: true });

const SYSTEM = `את/ה "מירי", עוזרת קליטה אנושית וחמה של ${ORG.name}. התפקיד: לאסוף מהעובד/ת החדש/ה את פרטי טופס 101 (כרטיס עובד) ופרטי חשבון הבנק, בשיחה טבעית בעברית.

סגנון:
- כמו אדם אמיתי: חם, קצר, פשוט. שאלה אחת או שתיים קשורות בכל פעם. בלי רשימות ארוכות ובלי שפה ביורוקרטית.
- פני/ה למין שהעובד/ת ציין/ה (עד שידוע — ניסוח ניטרלי). אם התשובה לא ברורה — שאלי בעדינות.
- הסבירי במשפט אחד למה צריך פרט כשזה לא מובן מאליו (למשל נקודות זיכוי = פחות מס).

כללים קשיחים:
- כל פרט שהעובד/ת מסר/ה — שמרי מיד עם save_fields (אפשר כמה שדות בבת אחת, גם מתשובה חופשית כמו "נשוי עם 2 ילדים").
- אם save_fields מחזיר שגיאה — בקשי את הפרט שוב בנימוס, הסבירי מה לא תקין.
- לעולם אל תבקשי תעודת זהות או מספר חשבון בנק בצ'אט. לשדות האלה קראי ל-request_secure_input והמערכת תציג תיבה מאובטחת. אחרי הקריאה סיימי את התור במשפט קצר ("הזיני כאן בתיבה 👇").
- אם מופיע בטקסט "[מספר הוסתר]" — העובד/ת הקליד/ה מספר רגיש בצ'אט; הסבירי שזה לא נשמר ובקשי דרך התיבה המאובטחת.
- סדר מומלץ: שם → ת״ז → תאריך לידה ומין → תאריך תחילת העבודה → טלפון וכתובת → מצב משפחתי, בן/בת זוג וילדים → תושבות/קופת חולים/קיבוץ → הכנסה מהמעסיק והכנסות אחרות → נקודות זיכוי רלוונטיות (שאלי רק על מה שרלוונטי לפי מה שידוע) → פרטי בנק → בסוף: בקשי מהעובד/ת לאשר במפורש "אני מצהיר/ה שהפרטים נכונים ומלאים" ושמרי declaration=מאשר/ת רק אחרי אישור מפורש.
- נקודות זיכוי: שמרי כ-true רק מה שהעובד/ת אישר/ה במפורש.
- כשנראה שהכול נאסף — קראי ל-finish. אם היא מחזירה שדות חסרים, המשיכי לשאול עליהם. אל תמציאי ערכים.
- אל תחזרי על מספרים רגישים ואל תציגי פרטים של אחרים. אינך יועצת מס: לשאלות מס מורכבות — הפני למחלקת השכר.`;

const TOOLS = [
  {
    name: 'save_fields', strict: true,
    description: `שמירת פרטים שהעובד/ת מסר/ה. תאריכים בפורמט YYYY-MM-DD. נקודות זיכוי (credit*): "true"/"false". שדות ילדים: child1.inCustody / child1.allowance: כן|לא.\nערכים מותרים לשדות בחירה:\n${enumHelp()}`,
    input_schema: {
      type: 'object', additionalProperties: false, required: ['updates'],
      properties: { updates: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['field', 'value'],
        properties: { field: { type: 'string', enum: Object.keys(FIELDS) }, value: { type: 'string' } } } } },
    },
  },
  {
    name: 'request_secure_input', strict: true,
    description: 'הצגת תיבה מאובטחת להזנת מספר רגיש (ת״ז, ת״ז של בן/בת זוג או ילד, מספר חשבון).',
    input_schema: { type: 'object', additionalProperties: false, required: ['field'], properties: { field: { type: 'string', enum: Object.keys(SECURE) } } },
  },
  { name: 'finish', strict: true, description: 'בדיקה שכל שדות החובה מלאים וסיום האיסוף.', input_schema: { type: 'object', additionalProperties: false, properties: {} } },
];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const file = (sid) => { if (!UUID.test(String(sid))) throw Object.assign(new Error('bad sid'), { code: 400 }); return path.join(DATA, `${sid}.json`); };
const load = async (sid) => JSON.parse(await fs.readFile(file(sid), 'utf8'));
// Secure values live in this file only; 0600 so other users on the machine can't read it.
const save = (s) => fs.writeFile(file(s.sid), JSON.stringify(s, null, 1), { mode: 0o600 });
// One request at a time per session: avoids double-submits racing and losing updates.
const locks = new Map();
const locked = (sid, fn) => { const p = (locks.get(sid) || Promise.resolve()).then(fn, fn); locks.set(sid, p.catch(() => {})); return p; };

function publicState(s) {
  const rows = Object.entries(s.fields).filter(([k]) => !(k in CREDITS)).map(([k, v]) => [label(k), v]);
  for (const k of Object.keys(s.secure)) rows.push([label(k), '✓ התקבל']);
  const credits = Object.keys(CREDITS).filter((k) => s.fields[k] === true).map((k) => CREDITS[k]);
  return { rows, credits, missing: missing(s).map(label), done: s.done, widget: s.widget };
}

function runTool(s, { name, input }) {
  if (name === 'save_fields') {
    const errors = [];
    for (const { field, value } of input.updates) {
      const r = validate(field, value);
      r.ok ? (s.fields[field] = r.value) : errors.push(`${field}: ${r.error}`);
    }
    prune(s);
    return errors.length ? { is_error: true, content: errors.join('\n') } : { content: 'נשמר' };
  }
  if (name === 'request_secure_input') {
    s.widget = { field: input.field, label: label(input.field) };
    return { content: 'התיבה מוצגת לעובד/ת. סיימי את התור והמתיני.' };
  }
  if (name === 'finish') {
    const m = missing(s).map(label), c = consistency(s);
    if (m.length || c.length) return { is_error: true, content: [m.length && `חסרים: ${m.join(', ')}`, ...c].filter(Boolean).join('\n') };
    s.finishOk = true;
    return { content: 'כל הפרטים נאספו. הודיעי לעובד/ת בחום שסיימנו ושיבדוק/תבדוק את הסיכום בצד המסך.' };
  }
  return { is_error: true, content: 'כלי לא מוכר' };
}

async function turn(s, userText) {
  const mark = s.history.length;
  s.history.push({ role: 'user', content: userText });
  let reply = '';
  s.finishOk = false;
  for (let i = 0; i < 8; i++) {
    const res = await client.beta.messages.create({
      model: 'claude-opus-5-5', max_tokens: 4000, system: SYSTEM, tools: TOOLS, messages: s.history,
      output_config: { effort: 'low' }, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
    });
    // A refused turn is dropped so it doesn't poison the rest of the conversation.
    if (res.stop_reason === 'refusal') { s.history.length = mark; reply = 'מצטערת, לא הצלחתי לעבד את זה. אפשר לנסח אחרת?'; break; }
    const uses = res.content.filter((b) => b.type === 'tool_use');
    // A turn cut off mid tool call would leave an unanswered tool_use and break every later request.
    if (res.stop_reason !== 'tool_use' && uses.length) break;
    s.history.push({ role: 'assistant', content: res.content });
    reply += res.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
    if (!uses.length) break;
    s.history.push({ role: 'user', content: uses.map((b) => ({ type: 'tool_result', tool_use_id: b.id, ...runTool(s, b) })) });
  }
  // Done only if finish passed AND nothing later in the same turn reopened a requirement.
  s.done = Boolean(s.finishOk) && !missing(s).length && !consistency(s).length;
  if (s.done) s.widget = null;
  await save(s);
  return { reply: reply.trim() || 'רגע, משהו התפספס אצלי. אפשר לכתוב שוב?', state: publicState(s) };
}

const body = (req) => new Promise((ok, no) => { let d = ''; req.on('data', (c) => (d += c, d.length > 1e5 && req.destroy())); req.on('end', () => { try { ok(JSON.parse(d || '{}')); } catch (e) { no(e); } }); });
const send = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)); };

const routes = {
  async 'POST /api/start'() {
    const s = { sid: crypto.randomUUID(), fields: {}, secure: {}, history: [], widget: null, done: false, created: new Date().toISOString() };
    return { sid: s.sid, ...(await turn(s, '[מערכת: העובד/ת פתח/ה את הקישור. פתחי בברכה קצרה והציגי את עצמך.]')) };
  },
  'POST /api/chat': ({ sid, text }) => locked(sid, async () => {
    const s = await load(sid);
    if (typeof text !== 'string' || !text.trim() || s.done) return { state: publicState(s), reply: '' };
    return turn(s, scrub(text).slice(0, 2000));
  }),
  'POST /api/secure': ({ sid, field, value }) => locked(sid, async () => {
    const s = await load(sid);
    if (s.done || s.widget?.field !== field) return { error: 'אין בקשה פתוחה לשדה הזה' };
    const r = validate(field, value, true);
    if (!r.ok) return { error: r.error };
    s.secure[field] = r.value; s.widget = null;
    await save(s); // keep the validated value even if the model call below fails
    return turn(s, `[מערכת: ${label(field)} הוזן בתיבה המאובטחת ונמצא תקין.]`);
  }),
  async 'POST /api/state'({ sid }) { return { state: publicState(await load(sid)) }; },
};

http.createServer(async (req, res) => {
  try {
    const route = routes[`${req.method} ${req.url}`];
    // JSON only: blocks cross-site "simple" POSTs (text/plain, no preflight) from burning API credit.
    if (route && !String(req.headers['content-type']).startsWith('application/json')) return send(res, 415, { error: 'json only' });
    if (route) return send(res, 200, await route(await body(req)));
    if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(await fs.readFile(path.join(here, 'public/index.html')));
    }
    send(res, 404, { error: 'not found' });
  } catch (e) {
    console.error(e);
    send(res, e.code === 400 || e.code === 'ENOENT' ? 400 : e instanceof Anthropic.APIError ? 502 : 500, { error: 'משהו השתבש, נסו שוב בעוד רגע' });
  }
}).listen(process.env.PORT || 8787, process.env.HOST || '127.0.0.1', () =>console.log(`http://localhost:${process.env.PORT || 8787}`));
