// Simulated employees: a second Claude plays each persona against the running server,
// then the stored fields are compared with the persona's ground truth.  Usage: node test/simulate.mjs
import fs from 'node:fs/promises';
import Anthropic from '@anthropic-ai/sdk';
const BASE = process.env.URL || 'http://localhost:8787', client = new Anthropic();
const P = [
  { name: 'רווק פשוט', bio: 'דני כהן, זכר, נולד 14/02/1999, ת"ז 123456782, נייד 0521234567, גר ברחוב הרצל 5 תל אביב, רווק בלי ילדים, תושב ישראל, חבר מכבי, לא בקיבוץ, משכורת חודש, אין הכנסות אחרות, חייל משוחרר, בנק 12 סניף 345 חשבון 678901, החשבון על שמו.',
    expect: { firstName: 'דני', lastName: 'כהן', birthDate: '1999-02-14', maritalStatus: 'רווק/ה', childrenCount: 0, healthFund: 'מכבי', creditDischarged: true, bankNumber: '12', branchNumber: '345' } },
  { name: 'אמא עם ילדים, עונה בבלגן', bio: 'מיכל לוי, נקבה, נולדה 3.3.1986, ת"ז 000000018, נייד 054-765-4321, רחוב הגפן 12 ראש העין. נשואה לאבי לוי (נולד 1/1/1984, ת"ז 123456782, עובד). 2 ילדים בחזקתה: נועם (ת"ז 000000026, 5/6/2015) ותמר (ת"ז 000000034, 9/9/2020), מקבלת קצבה על שניהם. כללית. משכורת חלקית. אין הכנסה אחרת. בנק 20 סניף 600 חשבון 1234567 על שמה. עונה לפעמים כמה דברים בבת אחת עם שגיאות כתיב.',
    expect: { firstName: 'מיכל', maritalStatus: 'נשוי/אה', spouseName: 'אבי לוי', childrenCount: 2, 'child1.name': 'נועם', 'child2.birthDate': '2020-09-09', healthFund: 'כללית', incomeType: 'משכורת חלקית' } },
  { name: 'עולה חדש עם שתי עבודות', bio: 'Alex Petrov — אלכס פטרוב, זכר, נולד 20/07/1990, עלה 01/03/2024, ת"ז 000000042, נייד 0501112233, רח׳ ויצמן 3 חיפה, רווק, אין ילדים, תושב, מאוחדת, משכורת נוספת (יש לו עבודה אחרת כמשכורת), רוצה נקודות זיכוי במעסיק האחר, לא רוצה תיאום מס, עולה חדש. בנק 11 סניף 101 חשבון 55667788. מנסה בהתחלה להקליד ת"ז בצ׳אט.',
    expect: { immigrationDate: '2024-03-01', otherIncome: 'יש', otherIncomeCredits: 'במעסיק האחר', taxCoordination: 'לא', creditImmigrant: true } },
];
const post = (p, b) => fetch(BASE + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then((r) => r.json());
async function employee(bio, transcript, widget) {
  const r = await client.messages.create({ model: 'claude-opus-5-5', max_tokens: 800, output_config: { effort: 'low' },
    system: `אתה משחק עובד חדש שעונה לבוט קליטה. הפרטים שלך: ${bio}\nענה בקצרה כמו אדם אמיתי, בעברית, רק על מה שנשאלת. ${widget ? `כעת מוצגת תיבה מאובטחת עבור "${widget}" — השב רק את הערך עצמו (ספרות בלבד).` : ''}`,
    messages: [{ role: 'user', content: `השיחה עד כה:\n${transcript}\n\nמה אתה עונה עכשיו?` }] });
  return r.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
}
let fails = 0;
for (const p of P) {
  let r = await post('/api/start', {}), sid = r.sid, log = `בוט: ${r.reply}`;
  for (let i = 0; i < 40 && !r.state?.done; i++) {
    const w = r.state?.widget, ans = await employee(p.bio, log, w?.label);
    r = w ? await post('/api/secure', { sid, field: w.field, value: ans }) : await post('/api/chat', { sid, text: ans });
    log += `\nעובד: ${w ? '[תיבה מאובטחת]' : ans}${r.error ? `\n(שגיאה: ${r.error})` : ''}\nבוט: ${r.reply || ''}`;
  }
  const s = JSON.parse(await fs.readFile(new URL(`../data/${sid}.json`, import.meta.url), 'utf8'));
  const bad = Object.entries(p.expect).filter(([k, v]) => s.fields[k] !== v);
  const leaked = JSON.stringify(s.history).match(/\b(123456782|000000018|000000026|000000034|000000042|678901|1234567|55667788)\b/g);
  const ok = s.done && !bad.length && !leaked;
  fails += !ok;
  console.log(`${ok ? '✅' : '❌'} ${p.name}: done=${s.done} turns=${log.split('\nעובד:').length - 1}`);
  bad.forEach(([k, v]) => console.log(`   ${k}: expected ${v} got ${s.fields[k]}`));
  if (leaked) console.log(`   ⚠️ sensitive numbers reached the model: ${[...new Set(leaked)]}`);
  await fs.writeFile(new URL(`../data/sim-${p.name}.txt`, import.meta.url), log);
}
process.exit(fails ? 1 : 0);
