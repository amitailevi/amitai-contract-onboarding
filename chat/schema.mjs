// Form 101 field model: labels, validators, secure fields and completeness rules.
// Field names match the legacy form (public/index.html) so the PDF generator can be reused.

const israeliId = (v) => {
  const d = String(v).replace(/\D/g, '');
  if (d.length < 5 || d.length > 9) return null;
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
const count = (v) => { const n = Number(v); return Number.isInteger(n) && n >= 0 && n <= 12 ? n : null; };
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
  bankNumber: ['מספר בנק', digits(2, 2)], branchNumber: ['מספר סניף', digits(3, 3)],
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
    'bankNumber', 'branchNumber', 'accountNumber', 'accountHolder'];
  const f = s.fields;
  if (f.healthFundMember === 'כן') req.push('healthFund');
  if (f.otherIncome === 'יש') req.push('otherIncomeType', 'otherIncomeCredits', 'taxCoordination');
  if (f.maritalStatus === 'נשוי/אה') req.push('spouseName', 'spouseId', 'spouseBirthDate', 'spouseHasIncome');
  for (let i = 1; i <= (f.childrenCount || 0); i++) req.push(`child${i}.name`, `child${i}.id`, `child${i}.birthDate`, `child${i}.inCustody`);
  return req.filter((k) => !has(k));
}

export const label = (k) => (FIELDS[k] || SECURE[k] || [k])[0];
// Masks digit runs that look like an ID or account number so they never reach the model.
export const scrub = (t) => String(t).replace(/(?<!\d)\d[\d -]{5,}\d(?!\d)/g, (m) => (m.replace(/\D/g, '').length >= 6 && !/^0?5\d{8}$/.test(m.replace(/\D/g, '')) ? '[מספר הוסתר]' : m));
