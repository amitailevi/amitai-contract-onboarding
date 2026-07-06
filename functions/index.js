const path = require("path");
const fs = require("fs");
const admin = require("firebase-admin");
const cors = require("cors");
const express = require("express");
const functions = require("firebase-functions");
const nodemailer = require("nodemailer");
const chromium = require("@sparticuz/chromium");
const puppeteer = require("puppeteer-core");

admin.initializeApp();

// Hebrew font embedded as a data URI so headless Chromium (which ships without
// Hebrew fonts) always renders Hebrew correctly, independent of system fonts.
const FONT_B64 = fs.readFileSync(path.join(__dirname, "fonts", "NotoSansHebrew.ttf")).toString("base64");
const TOFES1_B64 = fs.readFileSync(path.join(__dirname, "assets", "tofes-101-page-1.webp")).toString("base64");
const TOFES2_B64 = fs.readFileSync(path.join(__dirname, "assets", "tofes-101-page-2.webp")).toString("base64");

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: "12mb" }));

/* ---------------- helpers ---------------- */
function requireField(data, key, label) {
  if (!data[key]) {
    const error = new Error(`חסר שדה חובה: ${label}`);
    error.status = 400;
    throw error;
  }
}
function esc(v) {
  return String(v == null ? "" : v)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function line(v) {
  const s = String(v == null ? "" : v).trim();
  return s ? esc(s) : "________________";
}
function yesNo(v) { return v ? "☑" : "☐"; }
function money(v) {
  const s = String(v == null ? "" : v).trim();
  return s ? `${esc(s)} ₪` : "________";
}

/* ---------------- contract HTML (server-rendered by Chromium) ---------------- */
function contractInner(d) {
  const name = d.contractEmployeeName || "";
  const address = [d.contractEmployeeAddress, d.contractCity].filter(Boolean).join(", ");
  const both = d.workShift === "גם בקייטנה וגם בצהרון";
  const roleLabel = both ? [d.contractRole, d.contractRole2].filter(Boolean).join(" / ") : (d.contractRole || "");
  const wageLabel = both
    ? [d.hourlyWage, d.hourlyWage2].filter(Boolean).map((w) => w + " ₪").join(" / ")
    : (d.hourlyWage ? d.hourlyWage + " ₪" : "");
  const NAVY = "#123a6b", TEAL = "#17b0c4", INK = "#111827", MUTED = "#64748b",
    BODY = "#26324a", LINE = "#e5e9f0", DOT = "#cbd5e1", SIGN = "#94a3b8";

  const metaCell = (label, val) => `<td style="padding:7px 6px;vertical-align:top;width:50%">`
    + `<div style="font-size:11px;color:${MUTED};font-weight:700">${esc(label)}</div>`
    + `<div style="font-size:13px;color:${INK};border-bottom:1px dotted ${DOT};min-height:17px">${line(val)}</div></td>`;
  const metaRows = [
    ["תאריך חתימה", d.contractDate, "שם העובד/ת", name],
    ["מספר זהות", d.contractEmployeeId, "כתובת", address],
    ["תפקיד", roleLabel, "מסגרת / מקום עבודה", d.contractBranch],
    ["ממונה ישיר/ה", d.directManager, "שכר לשעה", wageLabel]
  ].map((r) => `<tr>${metaCell(r[0], r[1])}${metaCell(r[2], r[3])}</tr>`).join("");

  const clause = (t, b) => `<div style="margin-top:13px">`
    + `<div style="font-size:14px;font-weight:800;color:${NAVY};margin-bottom:3px">${esc(t)}</div>`
    + `<div style="font-size:12.5px;color:${BODY};line-height:1.6">${b}</div></div>`;
  const wageClauses = both
    ? [
        ["שכר ותשלום — קייטנה", `עבור שעות העבודה כ${line(d.contractRole)} — השכר יהיה ${money(d.hourlyWage)} לשעה, וישולם בכפוף לדיווחי נוכחות, הוראות הדין וניכויי חובה.`],
        ["שכר ותשלום — צהרון", `עבור שעות העבודה כ${line(d.contractRole2)} — השכר יהיה ${money(d.hourlyWage2)} לשעה, וישולם בכפוף לדיווחי נוכחות, הוראות הדין וניכויי חובה.`]
      ]
    : [
        ["שכר ותשלום", `השכר יהיה ${money(d.hourlyWage)} לשעה, וישולם בכפוף לדיווחי נוכחות, הוראות הדין וניכויי חובה.`]
      ];
  const clauses = [
    ["מהות התפקיד", `העובד/ת יועסק/ת בתפקיד ${line(roleLabel)} במסגרת ${line(d.contractBranch)} או בכל מסגרת אחרת שתיקבע על ידי החברה בהתאם לצורכי העבודה.`],
    ["תקופת ההעסקה", `תקופת ההסכם תחל ביום ${line(d.contractStartDate)} ותסתיים ביום ${line(d.contractEndDate)}, אלא אם יוסכם אחרת בכתב או בהתאם לדין.`],
    ["שעות עבודה", `שעות העבודה יהיו ${line(d.workHours)}.`],
    ...wageClauses,
    ["נסיעות, פנסיה והודעה מוקדמת", `דמי נסיעות, הפרשות פנסיוניות והודעה מוקדמת יינתנו על פי דין.`],
    ["נהלים וסודיות", `העובד/ת מתחייב/ת לפעול בהתאם להוראות החברה, לשמור על סודיות, פרטיות ובטיחות, ולהימנע ממסירת מידע על ילדים, הורים, עובדים או פעילות החברה לצד שלישי.`]
  ].map(([t, b]) => clause(t, b)).join("");

  const checks = [
    ["שמירת סודיות ופרטיות", d.contractConfidentiality],
    ["נהלי בטיחות ומשמעת", d.contractSafety],
    ["מסירת מסמכי קליטה", d.contractDocuments],
    ["שימוש בפרטים לצורכי שכר ומס", d.contractTaxConsent]
  ].map(([l, v]) => `<div style="font-size:12.5px;color:${BODY};margin:2px 0">${yesNo(v)} ${esc(l)}</div>`).join("");

  const bankCell = (label, val) => `<td style="padding:6px 6px;vertical-align:top;width:33.33%">`
    + `<div style="font-size:11px;color:${MUTED};font-weight:700">${esc(label)}</div>`
    + `<div style="font-size:13px;color:${INK};border-bottom:1px dotted ${DOT};min-height:17px">${line(val)}</div></td>`;
  const bankRows = `<tr>${bankCell("שם הבנק", d.bankName)}${bankCell("מספר בנק", d.bankNumber)}${bankCell("מספר סניף", d.branchNumber)}</tr>`
    + `<tr>${bankCell("מספר חשבון", d.accountNumber)}${bankCell("בעל/ת החשבון", d.accountHolder)}<td></td></tr>`;

  const sign = (val, label) => `<td style="width:33.33%;text-align:center;padding:0 10px;vertical-align:bottom">`
    + `<div style="min-height:22px;border-bottom:1px solid ${SIGN};margin-bottom:5px">${line(val)}</div>`
    + `<div style="font-size:11px;color:${MUTED};font-weight:700">${esc(label)}</div></td>`;

  return `<div style="background:#fff;color:${INK}">`
    + `<div style="background:linear-gradient(135deg,${NAVY},${TEAL});color:#fff;padding:24px;text-align:center">`
      + `<div style="font-weight:800;letter-spacing:.3px">אמיתי לוי יזמות בע"מ</div>`
      + `<div style="font-size:25px;font-weight:800;margin:6px 0 3px">חוזה עבודה אישי</div>`
      + `<div style="opacity:.9;font-size:13px">גננת / סייעת / מדריך/ה</div></div>`
    + `<div style="padding:16px 26px 22px">`
      + `<table style="width:100%;border-collapse:collapse;border-bottom:1px solid ${LINE};margin-bottom:6px">${metaRows}</table>`
      + clauses
      + `<div style="margin-top:14px"><div style="font-size:14px;font-weight:800;color:${NAVY};margin-bottom:4px">הצהרות וסעיפים מיוחדים</div>${checks}</div>`
      + `<div style="margin-top:14px"><div style="font-size:14px;font-weight:800;color:${NAVY};margin-bottom:3px">הערות מיוחדות</div><div style="font-size:12.5px;color:${BODY}">${esc(d.contractNotes || "אין הערות מיוחדות.")}</div></div>`
      + `<div style="margin-top:14px"><div style="font-size:14px;font-weight:800;color:${NAVY};margin-bottom:4px">פרטי בנק לתשלום שכר</div>`
        + `<table style="width:100%;border-collapse:collapse">${bankRows}</table></div>`
      + `<table style="width:100%;border-collapse:collapse;border-top:1px solid ${LINE};margin-top:22px"><tr style="vertical-align:bottom">${sign(d.employeeSignatureName || name, "חתימת העובד/ת")}${sign(d.companySignatureName, "חתימת נציג/ת החברה")}${sign(d.contractDate, "תאריך")}</tr></table>`
    + `</div></div>`;
}

function contractDoc(d) {
  return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">`
    + `<style>`
    + `@font-face{font-family:'HebFont';src:url(data:font/ttf;base64,${FONT_B64}) format('truetype');font-weight:100 900}`
    + `*{box-sizing:border-box}`
    + `html,body{margin:0;padding:0}`
    + `body{font-family:'HebFont',Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}`
    + `</style></head><body>${contractInner(d)}</body></html>`;
}

async function renderContractPdf(formData) {
  const html = contractDoc(formData || {});
  const browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: { width: 900, height: 1273 },
    executablePath: await chromium.executablePath(),
    headless: chromium.headless
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    return await page.pdf({
      format: "a4",
      printBackground: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" }
    });
  } finally {
    await browser.close();
  }
}

/* ---------------- Form 101 (data overlaid on the official form images) ---------------- */
function of(value, left, top, width) {
  const s = String(value == null ? "" : value).trim();
  if (!s) return "";
  return `<span class="of" style="left:${left}%;top:${top}%;width:${width}%">${esc(s)}</span>`;
}
function oc(checked, left, top) {
  return checked ? `<span class="oc" style="left:${left}%;top:${top}%">✓</span>` : "";
}
function form101Doc(f) {
  const firstName = f.firstName || "";
  const lastName = f.lastName || "";
  const fullName = [firstName, lastName].filter(Boolean).join(" ") || (f.contractEmployeeName || "");
  const idNumber = f.contractEmployeeId || "";
  const city = f.contractCity || "";
  const street = f.contractEmployeeAddress || "";
  const combinedAddr = [street, city].filter(Boolean).join(" ");
  const startDate = f.contractStartDate || "";
  const formDate = f.contractDate || "";
  const children = [1, 2, 3]
    .map((i) => ({ name: f["child" + i + "Name"], id: f["child" + i + "Id"], birthDate: f["child" + i + "BirthDate"] }))
    .filter((c) => c.name || c.id || c.birthDate);
  const spouseName = f.spouseName || "";
  const spouseFirst = spouseName.split(" ").slice(0, -1).join(" ");
  const spouseLast = spouseName.split(" ").slice(-1).join(" ");

  const creditMap = [
    ["creditResident", 5.5], ["creditDisabled", 8.0], ["creditLocality", 11.6], ["creditImmigrant", 14.6],
    ["creditSpouseNoIncome", 19.0], ["creditSeparatedParent", 22.4], ["creditChildrenCustody", 25.8], ["creditToddlers", 32.5],
    ["creditSingleParent", 38.5], ["creditChildSupport", 40.9], ["creditDisabledChild", 44.0], ["creditAlimony", 47.6],
    ["creditYoungEmployee", 49.7], ["creditDischarged", 52.0], ["creditStudies", 54.6], ["creditReserve", 56.5]
  ];
  const page2Checks = creditMap.map(([k, top]) => oc(Boolean(f[k]), 87.0, top)).join("");

  const page1 = `<div class="page101"><img src="data:image/webp;base64,${TOFES1_B64}">`
    + of("2026", 35.0, 10.5, 12)
    + of('אמיתי לוי יזמות בע"מ', 71.0, 20.0, 25)
    + of(idNumber, 74.0, 26.0, 20)
    + of(lastName, 57.5, 26.0, 14)
    + of(firstName, 44.5, 26.0, 12)
    + of(f.birthDate, 26.0, 26.0, 16)
    + of(f.immigrationDate, 6.0, 26.0, 16)
    + of(combinedAddr, 8.0, 30.2, 58)
    + of(f.email, 58.0, 37.6, 38)
    + of(f.phone, 30.0, 37.6, 26)
    + of(f.mobile, 2.0, 37.6, 26)
    + oc(f.gender === "זכר", 93.0, 33.6) + oc(f.gender === "נקבה", 93.0, 35.0)
    + oc(f.maritalStatus === "רווק/ה", 83.0, 33.6) + oc(f.maritalStatus === "נשוי/אה", 76.0, 33.6)
    + oc(f.maritalStatus === "גרוש/ה", 69.0, 33.6) + oc(f.maritalStatus === "אלמן/ה", 83.0, 35.0)
    + oc(f.maritalStatus === "פרוד/ה", 76.0, 35.0)
    + oc(f.isIsraeliResident === "כן", 56.0, 33.6) + oc(f.isIsraeliResident === "לא", 56.0, 35.0)
    + oc(f.kibbutzMember === "כן", 43.0, 33.6) + oc(f.kibbutzMember === "לא", 43.0, 35.0)
    + oc(f.healthFundMember === "לא", 29.0, 33.6) + oc(f.healthFundMember === "כן", 29.0, 35.0)
    + of(children[0] && children[0].name, 76.0, 45.8, 14) + of(children[0] && children[0].id, 54.0, 45.8, 16) + of(children[0] && children[0].birthDate, 38.0, 45.8, 14)
    + of(children[1] && children[1].name, 76.0, 48.1, 14) + of(children[1] && children[1].id, 54.0, 48.1, 16) + of(children[1] && children[1].birthDate, 38.0, 48.1, 14)
    + of(children[2] && children[2].name, 76.0, 50.4, 14) + of(children[2] && children[2].id, 54.0, 50.4, 16) + of(children[2] && children[2].birthDate, 38.0, 50.4, 14)
    + of(startDate, 4.0, 46.5, 22)
    + oc(f.incomeType === "משכורת חודש", 51.0, 42.7) + oc(f.incomeType === "משכורת בעד משרה נוספת", 51.0, 44.4)
    + oc(f.incomeType === "משכורת חלקית", 51.0, 46.0) + oc(f.incomeType === "שכר עבודה (עובד יומי)", 51.0, 47.6)
    + oc(f.incomeType === "קצבה", 51.0, 49.2) + oc(f.incomeType === "מלגה", 51.0, 50.8)
    + oc(f.otherIncome === "אין לי הכנסות אחרות", 51.0, 53.0) + oc(f.otherIncome === "יש לי הכנסות נוספות", 51.0, 57.0)
    + of(f.spouseId, 74.0, 83.5, 20) + of(spouseLast, 57.5, 83.5, 14) + of(spouseFirst, 44.5, 83.5, 12) + of(f.spouseBirthDate, 26.0, 83.5, 16)
    + of(fullName, 4.0, 92.0, 18)
    + `</div>`;

  const page2 = `<div class="page101"><img src="data:image/webp;base64,${TOFES2_B64}">`
    + page2Checks
    + of(fullName, 2.0, 79.0, 18)
    + of(formDate, 28.0, 79.0, 16)
    + `</div>`;

  return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><style>`
    + `@font-face{font-family:'HebFont';src:url(data:font/ttf;base64,${FONT_B64}) format('truetype');font-weight:100 900}`
    + `@page{size:A4;margin:0}`
    + `*{box-sizing:border-box}html,body{margin:0;padding:0}`
    + `body{font-family:'HebFont',Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}`
    + `.page101{position:relative;width:210mm;height:297mm;overflow:hidden}`
    + `.page101+.page101{page-break-before:always}`
    + `.page101 img{position:absolute;top:0;left:0;width:100%;height:100%;display:block}`
    + `.of{position:absolute;direction:rtl;text-align:center;color:#111;font-weight:700;font-size:9pt;line-height:1}`
    + `.oc{position:absolute;color:#111;font-weight:900;font-size:13pt;line-height:1}`
    + `</style></head><body>${page1}${page2}</body></html>`;
}

async function render101Pdf(formData) {
  const html = form101Doc(formData || {});
  const browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: { width: 900, height: 1273 },
    executablePath: await chromium.executablePath(),
    headless: chromium.headless
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    return await page.pdf({ format: "a4", printBackground: true, margin: { top: "0", right: "0", bottom: "0", left: "0" } });
  } finally {
    await browser.close();
  }
}

/* ---------------- email ---------------- */
function createTransport() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  return nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: { user, pass }
  });
}

async function sendContractCopy({ email, fullName, submissionId, mailAttachments }) {
  const subject = "חוזה העסקה - אמיתי לוי יזמות בע\"מ";
  const text = `שלום ${fullName || ""},\n\n`
    + `תודה על מילוי טופס הקליטה. מצורף למייל זה חוזה העבודה כפי שמילאת.\n`
    + `יש לבדוק את הפרטים ולשמור עותק. לכל שאלה ניתן להשיב למייל זה.\n\n`
    + `בברכה,\nאמיתי לוי יזמות בע"מ`;

  const attachments = Array.isArray(mailAttachments) ? mailAttachments : [];

  async function queueMail(status, extra) {
    await admin.firestore().collection("mailQueue").add(Object.assign({
      to: email, subject, text, submissionId,
      attachmentCount: attachments.length, status,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    }, extra || {}));
  }

  const transport = createTransport();
  if (!transport) {
    await queueMail("pending_smtp_config");
    return { sent: false, queued: true };
  }
  try {
    await transport.sendMail({
      from: process.env.MAIL_FROM || process.env.SMTP_USER,
      to: email, subject, text, attachments
    });
    return { sent: true, queued: false, attachmentCount: attachments.length };
  } catch (error) {
    console.error("sendContractCopy failed:", error);
    await queueMail("send_failed", { error: error.message || String(error) });
    return { sent: false, queued: true, error: error.message || String(error) };
  }
}

/* ---------------- Airtable back-office ---------------- */
const AIRTABLE_BASE = "app8yycUBnh8Hrlqo";
const AIRTABLE_TABLE = "tblC2en9pCuXgqpFM";
const AT = {
  name: "fldvt69i9yDLayDQC", email: "fldX908ZZ7N2EYLQ9", id: "fldkFXmavibrxnArg",
  status: "fldFY7bJRzAcUutWm", pdf: "fldhxAO4H5DMqBPBt", documents: "fldni0BTosxisPWoI", form101: "fldeSvJYwzP5CQv5c",
  contractDate: "fld91Zt8bsHHOZlAg", address: "fldF8V8L0C2jaiDDJ", city: "fldbQHUPhP6x9yEBQ",
  workShift: "fldMcyPpIokdOFZGg", role2: "fld5xNCiGAtyCl85F", wage2: "fldYzjgQaLHK6m45e",
  role: "fldtiJs3i9DEYgR9P", teachingCert: "fld58JA2JAdtyM7F8", assistantType: "fldiIM1fu6YMaCjMe",
  branch: "fld6vyCxsV2g65oYk", start: "fldX09TsRHb68LcNZ", end: "fldmunRb2vORi3tJT",
  workDays: "fldmeT1aSryvOjKQX", workHours: "fldAHvJZvAisOK2vZ", scope: "fld2b1YAzylL51Asa",
  wage: "fldJxKqlHD9jsqXVr", payFreq: "fld24noimWMZhMJ1Q", travel: "fldQT9gXfo3PKkFME",
  pension: "fldhxScNjh77vH73Q", notice: "flduJKMR1gRDMwJkC", trial: "fldACCwY3EDBmPV2H",
  manager: "fldqWOy83KS3wkRmO", declarations: "fldjIg8C9zDfBejuy", notes: "fldZoZX1pjFKLHT0X",
  bankName: "fldsCJ0IizdSXD41N", bankNum: "fldeGthiRLTglnGLk", branchNum: "fldc76U6VED20dQRe",
  account: "fldfDOVR4fg05ICAA", accountHolder: "fldKuIaouhxDZaonD", subId: "fldAxS1C6vNM1VTno",
  sentAt: "fldIdrkNzui31iKsh",
  // ----- Form 101 fields (grouped separately from the contract fields) -----
  f101FirstName: "fldM9CqkV4MwzXNzi", f101LastName: "fldtOokK7t0Kh5Ozc",
  f101BirthDate: "fldgXUJZoYTsVetee", f101ImmigrationDate: "fldLDIIUop06wuu7X",
  f101Gender: "fldzKXMY3FJjWykun", f101Marital: "fldz77nNqtLUorkfF",
  f101Resident: "fld1KziEoxXZRCM0P", f101Kibbutz: "fldbuzEonZEsHYWil",
  f101HealthFund: "fld26SmWRtqeTvlDy", f101Mobile: "fldGFqIDmg4XLIKr8",
  f101IncomeType: "fldaEJoP0suNaZAkA", f101OtherIncome: "flddXxGN3t5FAIz1u",
  f101Spouse: "fldFRv6oCkkvdZ4cs", f101Children: "fldTSaEAsskZsLJfY",
  f101Credits: "fld6vhOs3bWaPerFx"
};

// Create the Airtable row and attach the contract PDF. Never throws — a back-office
// failure must not break the submission/email.
async function pushToAirtable(d, submissionId, pdfBuffer, pdfFilename, documents, form101Buffer, form101Filename) {
  const token = process.env.AIRTABLE_TOKEN;
  if (!token) { console.log("AIRTABLE_TOKEN not set — skipping Airtable push"); return; }

  const decl = [
    d.contractConfidentiality && "שמירת סודיות ופרטיות",
    d.contractSafety && "נהלי בטיחות ומשמעת",
    d.contractDocuments && "מסירת מסמכי קליטה",
    d.contractTaxConsent && "שימוש בפרטים לצורכי שכר ומס"
  ].filter(Boolean).join("\n");

  const fields = {};
  const put = (id, val) => { if (val !== undefined && val !== null && String(val).trim() !== "") fields[id] = val; };
  put(AT.name, d.contractEmployeeName);
  put(AT.email, d.email);
  put(AT.id, d.contractEmployeeId);
  fields[AT.status] = "חדש";
  put(AT.contractDate, d.contractDate);
  put(AT.address, d.contractEmployeeAddress);
  put(AT.city, d.contractCity);
  put(AT.workShift, d.workShift);
  put(AT.role, d.contractRole);
  put(AT.role2, d.contractRole2);
  put(AT.teachingCert, d.roleTeachingCert);
  put(AT.assistantType, d.roleAssistantType);
  put(AT.branch, d.contractBranch);
  put(AT.start, d.contractStartDate);
  put(AT.end, d.contractEndDate);
  put(AT.workDays, d.workDays);
  put(AT.workHours, d.workHours);
  put(AT.scope, d.positionScope);
  const wageNum = d.hourlyWage ? Number(String(d.hourlyWage).replace(/[^\d.]/g, "")) : NaN;
  if (!isNaN(wageNum)) fields[AT.wage] = wageNum;
  const wageNum2 = d.hourlyWage2 ? Number(String(d.hourlyWage2).replace(/[^\d.]/g, "")) : NaN;
  if (!isNaN(wageNum2)) fields[AT.wage2] = wageNum2;
  put(AT.payFreq, d.payFrequency);
  put(AT.travel, d.travelTerms);
  put(AT.pension, d.pensionTerms);
  put(AT.notice, d.noticeTerms);
  put(AT.trial, d.trialPeriod);
  put(AT.manager, d.directManager);
  put(AT.declarations, decl);
  put(AT.notes, d.contractNotes);
  put(AT.bankName, d.bankName);
  put(AT.bankNum, d.bankNumber);
  put(AT.branchNum, d.branchNumber);
  put(AT.account, d.accountNumber);
  put(AT.accountHolder, d.accountHolder);
  put(AT.subId, submissionId);
  fields[AT.sentAt] = new Date().toISOString();

  // ----- Form 101 (כרטיס עובד) — kept in the same record, grouped by the "101 ·" prefix -----
  const spouseLines = [
    d.spouseName && `שם: ${d.spouseName}`,
    d.spouseId && `ת"ז: ${d.spouseId}`,
    d.spouseBirthDate && `תאריך לידה: ${d.spouseBirthDate}`
  ].filter(Boolean).join("\n");
  const childLines = [1, 2, 3].map((i) => {
    const n = d["child" + i + "Name"], cid = d["child" + i + "Id"], b = d["child" + i + "BirthDate"];
    if (!n && !cid && !b) return "";
    return [n, cid && `ת"ז ${cid}`, b && `לידה ${b}`].filter(Boolean).join(" · ");
  }).filter(Boolean).join("\n");
  const CREDIT_LABELS = {
    creditResident: "תושב/ת ישראל", creditDisabled: "נכה 100% / עיוור",
    creditLocality: "תושב/ת ביישוב מזכה", creditImmigrant: "עולה חדש/ה",
    creditSpouseNoIncome: "בן/בת זוג ללא הכנסה", creditSeparatedParent: "הורה במשפחה חד-הורית",
    creditChildrenCustody: "ילדים שבחזקתי (חלק ג)", creditToddlers: "פעוטות",
    creditSingleParent: "הורה יחיד", creditChildSupport: "ילדים שאינם בחזקתי",
    creditDisabledChild: "ילד/ה עם מוגבלות", creditAlimony: "מזונות לבן/בת זוג לשעבר",
    creditYoungEmployee: "בן/בת 16-18", creditDischarged: "חייל/ת משוחרר/ת / שירות לאומי",
    creditStudies: "סיום לימודים לתואר", creditReserve: "לוחם/ת מילואים"
  };
  const creditLines = Object.keys(CREDIT_LABELS).filter((k) => d[k]).map((k) => CREDIT_LABELS[k]).join("\n");

  put(AT.f101FirstName, d.firstName);
  put(AT.f101LastName, d.lastName);
  put(AT.f101BirthDate, d.birthDate);
  put(AT.f101ImmigrationDate, d.immigrationDate);
  put(AT.f101Gender, d.gender);
  put(AT.f101Marital, d.maritalStatus);
  put(AT.f101Resident, d.isIsraeliResident);
  put(AT.f101Kibbutz, d.kibbutzMember);
  put(AT.f101HealthFund, d.healthFundMember);
  put(AT.f101Mobile, d.mobile);
  put(AT.f101IncomeType, d.incomeType);
  put(AT.f101OtherIncome, d.otherIncome);
  put(AT.f101Spouse, spouseLines);
  put(AT.f101Children, childLines);
  put(AT.f101Credits, creditLines);

  const createRes = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE}/${AIRTABLE_TABLE}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields, typecast: true })
  });
  if (!createRes.ok) {
    console.error("Airtable create failed:", createRes.status, await createRes.text());
    return;
  }
  const rec = await createRes.json();

  if (!rec.id) return;

  // uploadAttachment adds one file per call and appends to the field.
  async function upload(fieldId, contentType, filename, base64) {
    const r = await fetch(`https://content.airtable.com/v0/${AIRTABLE_BASE}/${rec.id}/${fieldId}/uploadAttachment`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ contentType, filename, file: base64 })
    });
    if (!r.ok) console.error("Airtable upload failed:", fieldId, r.status, await r.text());
  }

  if (pdfBuffer) {
    await upload(AT.pdf, "application/pdf", pdfFilename || "Contract.pdf", pdfBuffer.toString("base64"));
  }
  if (form101Buffer) {
    await upload(AT.form101, "application/pdf", form101Filename || "Form-101.pdf", form101Buffer.toString("base64"));
  }
  for (const doc of (Array.isArray(documents) ? documents : [])) {
    if (doc && doc.contentBase64 && doc.filename) {
      await upload(AT.documents, doc.contentType || "application/octet-stream", doc.filename, doc.contentBase64);
    }
  }
  return rec.id;
}

/* ---------------- routes ---------------- */
app.post("/api/contract-submissions", async (req, res) => {
  try {
    const body = req.body || {};
    const formData = body.formData || {};

    requireField(formData, "contractEmployeeName", "שם העובד/ת בחוזה");
    requireField(formData, "contractEmployeeId", "מספר תעודת זהות");
    requireField(formData, "email", "דואר אלקטרוני");

    const fullName = formData.contractEmployeeName || "";
    const idNum = String(formData.contractEmployeeId || "").replace(/[^\dA-Za-z]/g, "");
    const now = admin.firestore.FieldValue.serverTimestamp();

    const submissionRef = admin.firestore().collection("contractSubmissions").doc();
    await submissionRef.set({
      submissionId: submissionRef.id,
      fullName,
      email: formData.email,
      idNumberMasked: idNum ? `***${idNum.slice(-4)}` : "",
      source: body.source || "contract-onboarding-web",
      status: "submitted",
      formData,
      createdAt: now,
      updatedAt: now
    });

    // Generate the contract PDF server-side (real Chromium) — used for both the
    // email attachment and the Airtable back-office record.
    const pdfFilename = `Contract-${idNum || "employee"}.pdf`;
    const form101Filename = `Form-101-${idNum || "employee"}.pdf`;
    let pdfBuffer = null;
    let form101Buffer = null;
    try {
      pdfBuffer = await renderContractPdf(formData);
    } catch (e) {
      console.error("Contract PDF render failed:", e);
    }
    try {
      form101Buffer = await render101Pdf(formData);
    } catch (e) {
      console.error("Form 101 render failed:", e);
    }
    const mailAttachments = [];
    if (pdfBuffer) mailAttachments.push({ filename: pdfFilename, content: pdfBuffer, contentType: "application/pdf" });
    if (form101Buffer) mailAttachments.push({ filename: form101Filename, content: form101Buffer, contentType: "application/pdf" });

    const mailResult = await sendContractCopy({
      email: formData.email,
      fullName,
      submissionId: submissionRef.id,
      mailAttachments
    });

    // Push to the Airtable back office (non-fatal if it fails).
    let airtableRecordId = null;
    try {
      airtableRecordId = await pushToAirtable(
        formData, submissionRef.id, pdfBuffer, pdfFilename,
        Array.isArray(body.documents) ? body.documents : [],
        form101Buffer, form101Filename
      );
    } catch (e) {
      console.error("Airtable push failed:", e);
    }

    res.json({ ok: true, submissionId: submissionRef.id, mail: mailResult, airtable: Boolean(airtableRecordId) });
  } catch (error) {
    console.error(error);
    res.status(error.status || 500).json({ ok: false, error: error.message || "Internal server error" });
  }
});

exports.api = functions
  .runWith({ memory: "1GB", timeoutSeconds: 120, secrets: ["SMTP_PASS", "AIRTABLE_TOKEN"] })
  .https.onRequest(app);

