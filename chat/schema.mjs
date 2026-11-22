// Form 101 field model: labels, validators, secure fields and completeness rules.
// Field names match the legacy form (public/index.html) so the PDF generator can be reused.

const israeliId = (v) => {
  const d = String(v).replace(/\D/g, '');
  if (d.length < 5 || d.length > 9 || /^0+$/.test(d)) return null;
  const p = d.padStart(9, '0');
  const sum = [...p].reduce((s, c, i) => { const x = +c * (i % 2 + 1); return s + (x > 9 ? x - 9 : x); }, 0);
  return sum % 10 === 0 ? p : null;
};
const date = (v) => {
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) m = [m[1], m[2], m[3]];
  else if ((m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/))) m = [m[3], m[2], m[1]];
  else return null;
  const [y, mo, d] = m.map(Number), dt = new Date(Date.UTC(y, mo - 1, d));
  const ok = dt.getUTCMonth() === mo - 1 && y > 1900 && dt <= new Date();
  return ok ? dt.toISOString().slice(0, 10) : null;
};
const oneOf = (...opts) => (v) => (opts.includes(String(v).trim()) ? String(v).trim() : null);
const yesNo = oneOf('כן', 'לא');
const text = (v) => { const s = String(v).trim(); return s.length >= 1 && s.length <= 120 ? s : null; };
const digits = (min, max) => (v) => { const d = String(v).replace(/\D/g, ''); return d.length >= min && d.length <= max ? d : null; };
const mobile = (v) => { const d = String(v).replace(/\D/g, '').replace(/^972/, '0'); return /^05\d{8}$/.test(d) ? d : null; };
const email = (v) => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v).trim()) ? String(v).trim() : null);
const count = (v) => (/^\d{1,2}$/.test(String(v).trim()) && +v <= 12 ? +v : null);
const bool = (v) => (v === true || v === 'true' || v === 'כן' ? true : v === false || v === 'false' || v === 'לא' ? false : null);

export const MAX_CHILDREN = 12;

const BASE = {
  firstName: ['שם פרטי', text], lastName: ['שם משפחה', text],
  birthDate: ['תאריך לידה', date], immigrationDate: ['תאריך עלייה', date],
  gender: ['מין', oneOf('זכר', 'נקבה')],
  maritalStatus: ['מצב משפחתי', oneOf('רווק/ה', 'נשוי/אה', 'גרוש/ה', 'אלמן/ה', 'פרוד/ה')],
  isIsraeliResident: ['תושב/ת ישראל', yesNo], kibbutzMember: ['חבר/ת קיבוץ או מושב שיתופי', yesNo],
  healthFundMember: ['חבר/ת קופת חולים', yesNo], healthFund: ['קופת חולים', oneOf('כללית', 'מכבי', 'מאוחדת', 'לאומית')],
  mobile: ['טלפון נייד', mobile], email: ['אימייל', email],
  street: ['רחוב ומספר', text], city: ['יישוב', text], zip: ['מיקוד', digits(5, 7)],
  incomeType: ['סוג ההכנסה מהמעסיק', oneOf('משכורת חודש', 'משכורת נוספת', 'משכורת חלקית', 'שכר עבודה (יומי)', 'קצבה', 'מלגה')],
  otherIncome: ['הכנסות אחרות', oneOf('אין', 'יש')],
  otherIncomeType: ['סוג ההכנסה האחרת', text],
  otherIncomeCredits: ['נקודות זיכוי לבקש כאן או אצל המעסיק האחר', oneOf('כאן', 'במעסיק האחר')],
  taxCoordination: ['בקשה לתיאום מס', yesNo],
  spouseName: ['שם בן/בת הזוג', text], spouseBirthDate: ['תאריך לידה של בן/בת הזוג', date],
  spouseImmigrationDate: ['תאריך עלייה של בן/בת הזוג', date],
  spouseHasIncome: ['לבן/בת הזוג יש הכנסה', oneOf('אין הכנסה', 'עבודה/קצבה/עסק', 'הכנסה אחרת')],
  childrenCount: ['מספר ילדים מתחת לגיל 19', count],
  startDate: ['תאריך תחילת העבודה אצל המעסיק', (v) => { const s = String(v).trim(), m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/) || s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/); if (!m) return null; const [y, mo, d] = m[1].length === 4 ? [m[1], m[2], m[3]] : [m[3], m[2], m[1]]; const dt = new Date(Date.UTC(+y, mo - 1, +d)); return dt.getUTCMonth() === mo - 1 && +y > 1990 && +y < 2100 ? dt.toISOString().slice(0, 10) : null; }],
  declaration: ['הצהרה שהפרטים נכונים ומלאים', oneOf('מאשר/ת')],
  bankNumber: ['מספר בנק', (v) => { const d = digits(1, 2)(v); return d && d.padStart(2, '0'); }], branchNumber: ['מספר סניף', digits(3, 3)],
  bankName: ['שם הבנק', text], accountHolder: ['שם בעל/ת החשבון', text],
};
export const CREDITS = {
  creditDisabled: 'נכה 100% / עיוור', creditLocality: 'תושב/ת יישוב מזכה', creditImmigrant: 'עולה חדש/ה',
  creditSpouseNoIncome: 'בן/בת זוג ללא הכנסה', creditSingleParent: 'הורה יחיד', creditSeparatedParent: 'הורה במשפחה חד-הורית',
  creditChildrenCustody: 'ילדים בחזקתי', creditToddlers: 'פעוטות', creditChildSupport: 'משלם/ת מזונות לילדים',
  creditDisabledChild: 'ילד/ה עם מוגבלות', creditAlimony: 'מזונות לבן/בת זוג לשעבר', creditYoungEmployee: 'בן/בת 16–18',
  creditDischarged: 'חייל/ת משוחרר/ת / שירות לאומי', creditStudies: 'סיום לימודים לתואר', creditReserve: 'לוחם/ת מילואים',
};
const CHILD = {
  name: ['שם', text], birthDate: ['תאריך לידה', date],
  inCustody: ['בחזקתי', yesNo], allowance: ['מקבל/ת עבורו קצבת ילדים', yesNo],
};

export const FIELDS = { ...BASE };
for (const [k, l] of Object.entries(CREDITS)) FIELDS[k] = [l, bool];
for (let i = 1; i <= MAX_CHILDREN; i++) for (const [k, [l, f]] of Object.entries(CHILD)) FIELDS[`child${i}.${k}`] = [`ילד/ה ${i} · ${l}`, f];

// Never sent to the model: entered in a dedicated widget, validated and stored server-side only.
export const SECURE = { employeeId: ['מספר תעודת זהות', israeliId], spouseId: ['ת״ז בן/בת הזוג', israeliId], accountNumber: ['מספר חשבון', digits(4, 9)] };
for (let i = 1; i <= MAX_CHILDREN; i++) SECURE[`child${i}.id`] = [`ילד/ה ${i} · ת״ז`, israeliId];

export function validate(field, value, secure = false) {
  const def = (secure ? SECURE : FIELDS)[field];
  if (!def) return { ok: false, error: `שדה לא מוכר: ${field}` };
  const v = def[1](value);
  return v === null ? { ok: false, error: `ערך לא תקין ל${def[0]}` } : { ok: true, value: v };
}

export function missing(s) {
  const has = (k) => s.fields[k] !== undefined || s.secure[k] !== undefined;
  const req = ['firstName', 'lastName', 'employeeId', 'birthDate', 'gender', 'maritalStatus', 'isIsraeliResident',
    'kibbutzMember', 'healthFundMember', 'mobile', 'street', 'city', 'incomeType', 'otherIncome', 'childrenCount',
    'bankNumber', 'branchNumber', 'accountNumber', 'accountHolder', 'startDate', 'declaration'];
  const f = s.fields;
  if (f.healthFundMember === 'כן') req.push('healthFund');
  if (f.otherIncome === 'יש') req.push('otherIncomeType', 'otherIncomeCredits', 'taxCoordination');
  if (f.maritalStatus === 'נשוי/אה') req.push('spouseName', 'spouseId', 'spouseBirthDate', 'spouseHasIncome');
  if (f.creditImmigrant === true) req.push('immigrationDate');
  for (let i = 1; i <= (f.childrenCount || 0); i++) req.push(`child${i}.name`, `child${i}.id`, `child${i}.birthDate`, `child${i}.inCustody`);
  return req.filter((k) => !has(k));
}

// Cross-field checks that finish must pass (contradictions the per-field validators can't see).
export function consistency(s) {
  const f = s.fields, out = [], n = f.childrenCount || 0, age = (d) => (d ? (Date.now() - Date.parse(d)) / 3.156e10 : null);
  if (f.creditSpouseNoIncome && (f.maritalStatus !== 'נשוי/אה' || (f.spouseHasIncome && f.spouseHasIncome !== 'אין הכנסה'))) out.push('זיכוי "בן/בת זוג ללא הכנסה" סותר את המצב המשפחתי/הכנסת בן/בת הזוג');
  if ((f.creditChildrenCustody || f.creditToddlers || f.creditDisabledChild) && !n) out.push('נבחר זיכוי על ילדים אבל מספר הילדים 0');
  if (f.immigrationDate && f.birthDate && f.immigrationDate < f.birthDate) out.push('תאריך העלייה לפני תאריך הלידה');
  if (f.creditYoungEmployee && !(age(f.birthDate) >= 16 && age(f.birthDate) < 19)) out.push('זיכוי בן/בת 16–18 לא מתאים לתאריך הלידה');
  for (let i = 1; i <= n; i++) {
    const b = f[`child${i}.birthDate`];
    if (b && age(b) >= 19) out.push(`ילד/ה ${i}: מעל גיל 19 — לא נכלל/ת בטופס`);
    if (b && f.birthDate && b <= f.birthDate) out.push(`ילד/ה ${i}: תאריך לידה לפני ההורה`);
  }
  return out;
}

// Drops child entries above childrenCount (e.g. the count was corrected from 3 to 2).
export function prune(s) {
  const n = s.fields.childrenCount ?? MAX_CHILDREN;
  for (const o of [s.fields, s.secure]) for (const k of Object.keys(o)) { const m = k.match(/^child(\d+)\./); if (m && +m[1] > n) delete o[k]; }
}

export const label = (k) => (FIELDS[k] || SECURE[k] || [k])[0];
// Masks anything that looks like an ID/account number (4+ digits, any digit script, any separators)
// so it never reaches the model. Only real Israeli mobiles (05XXXXXXXX) and dates pass.
export const scrub = (t) => String(t).normalize('NFKC').replace(/\p{Nd}(?:[\p{Nd}\s.\/,_\-–]*\p{Nd})?/gu, (m) => {
  const d = m.replace(/[^\p{Nd}]/gu, '');
  if (d.length < 4 || /^(\+?972|0)5\d{8}$/.test(d) || /^\d{1,2}[.\/-]\d{1,2}[.\/-]\d{4}$/.test(m.trim()) || /^\d{4}-\d{1,2}-\d{1,2}$/.test(m.trim()) || /^(19|20)\d{2}$/.test(d)) return m;
  return '[מספר הוסתר]';
});
