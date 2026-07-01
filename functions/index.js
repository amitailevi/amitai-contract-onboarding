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

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: "2mb" }));

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
  const NAVY = "#123a6b", TEAL = "#17b0c4", INK = "#111827", MUTED = "#64748b",
    BODY = "#26324a", LINE = "#e5e9f0", DOT = "#cbd5e1", SIGN = "#94a3b8";

  const metaCell = (label, val) => `<td style="padding:7px 6px;vertical-align:top;width:50%">`
    + `<div style="font-size:11px;color:${MUTED};font-weight:700">${esc(label)}</div>`
    + `<div style="font-size:13px;color:${INK};border-bottom:1px dotted ${DOT};min-height:17px">${line(val)}</div></td>`;
  const metaRows = [
    ["תאריך חתימה", d.contractDate, "שם העובד/ת", name],
    ["מספר זהות", d.contractEmployeeId, "כתובת", d.contractEmployeeAddress],
    ["תפקיד", d.contractRole, "מסגרת / מקום עבודה", d.contractBranch],
    ["ממונה ישיר/ה", d.directManager, "שכר לשעה", d.hourlyWage ? d.hourlyWage + " ₪" : ""]
  ].map((r) => `<tr>${metaCell(r[0], r[1])}${metaCell(r[2], r[3])}</tr>`).join("");

  const clause = (t, b) => `<div style="margin-top:13px">`
    + `<div style="font-size:14px;font-weight:800;color:${NAVY};margin-bottom:3px">${esc(t)}</div>`
    + `<div style="font-size:12.5px;color:${BODY};line-height:1.6">${b}</div></div>`;
  const clauses = [
    ["מהות התפקיד", `העובד/ת יועסק/ת בתפקיד ${line(d.contractRole)} במסגרת ${line(d.contractBranch)} או בכל מסגרת אחרת שתיקבע על ידי החברה בהתאם לצורכי העבודה.`],
    ["תקופת ההעסקה", `תקופת ההסכם תחל ביום ${line(d.contractStartDate)} ותסתיים ביום ${line(d.contractEndDate)}, אלא אם יוסכם אחרת בכתב או בהתאם לדין.`],
    ["היקף עבודה", `ימי העבודה יהיו ${line(d.workDays)} ושעות העבודה יהיו ${line(d.workHours)}. היקף המשרה: ${line(d.positionScope)}.`],
    ["שכר ותשלום", `השכר יהיה ${money(d.hourlyWage)} לשעה, וישולם ${line(d.payFrequency)} בכפוף לדיווחי נוכחות, הוראות הדין וניכויי חובה.`],
    ["נסיעות ותנאים סוציאליים", `דמי נסיעות: ${line(d.travelTerms)}. הפרשות פנסיוניות: ${line(d.pensionTerms)}.`],
    ["הודעה מוקדמת ותקופת ניסיון", `הודעה מוקדמת: ${line(d.noticeTerms)}. תקופת ניסיון: ${line(d.trialPeriod)}.`],
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

    // Generate the contract PDF server-side (real Chromium).
    let mailAttachments = [];
    try {
      const pdfBuffer = await renderContractPdf(formData);
      mailAttachments = [{
        filename: `Contract-${idNum || "employee"}.pdf`,
        content: pdfBuffer,
        contentType: "application/pdf"
      }];
    } catch (e) {
      console.error("Contract PDF render failed:", e);
    }

    const mailResult = await sendContractCopy({
      email: formData.email,
      fullName,
      submissionId: submissionRef.id,
      mailAttachments
    });

    res.json({ ok: true, submissionId: submissionRef.id, mail: mailResult });
  } catch (error) {
    console.error(error);
    res.status(error.status || 500).json({ ok: false, error: error.message || "Internal server error" });
  }
});

exports.api = functions
  .runWith({ memory: "1GB", timeoutSeconds: 120, secrets: ["SMTP_PASS"] })
  .https.onRequest(app);
