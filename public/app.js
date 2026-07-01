"use strict";

const form = document.getElementById("onboardingForm");
const steps = Array.from(document.querySelectorAll(".step-card"));
const LAST_STEP = steps.length - 1;
const btnBack = document.getElementById("btnBack");
const btnNext = document.getElementById("btnNext");
const finalActions = document.getElementById("finalActions");
const contractPreview = document.getElementById("contractPreview");
const progressFill = document.getElementById("progressFill");
const progressLabel = document.getElementById("progressLabel");
const progressPct = document.getElementById("progressPct");

const STORAGE_KEY = "amitai-contract-onboarding-draft";
const STEP_TITLES = [
  "פרטי הצדדים",
  "פרטי הצדדים",
  "תנאי ההעסקה",
  "הצהרות וסעיפים מיוחדים",
  "פרטי בנק",
  "סיכום והגשה"
];
const REQUIRED_STEP0 = [
  ["contractEmployeeName", "שם העובד/ת"],
  ["contractEmployeeId", "מספר תעודת זהות"],
  ["email", "דואר אלקטרוני"]
];

let currentStep = 0;

/* ---------------- helpers ---------------- */
function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function valueOrLine(value) {
  const v = String(value == null ? "" : value).trim();
  return v ? escapeHtml(v) : "________________";
}
function yesNo(value) { return value ? "☑" : "☐"; }
function formatMoney(value) {
  const v = String(value == null ? "" : value).trim();
  return v ? `${escapeHtml(v)} ₪` : "________";
}

function getFormData() {
  const data = {};
  new FormData(form).forEach((value, key) => { data[key] = String(value || "").trim(); });
  Array.from(form.querySelectorAll("input[type='checkbox']")).forEach((input) => {
    data[input.name] = input.checked;
  });
  return data;
}
function fillForm(data) {
  if (!data) return;
  Object.entries(data).forEach(([key, value]) => {
    const field = form.elements[key];
    if (!field) return;
    if (field.type === "checkbox") { field.checked = Boolean(value); return; }
    field.value = value;
  });
}

/* ---------------- draft ---------------- */
function saveDraft(silent) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(getFormData()));
  if (!silent) toast("הטיוטה נשמרה במכשיר.");
}
function clearDraft() {
  if (!confirm("לנקות את הטיוטה ולהתחיל מחדש?")) return;
  localStorage.removeItem(STORAGE_KEY);
  form.reset();
  goToStep(0);
  toast("הטיוטה נוקתה.");
}

/* ---------------- toast ---------------- */
let toastTimer = null;
function toast(msg) {
  let el = document.getElementById("toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "toast";
    el.style.cssText = "position:fixed;bottom:22px;left:50%;transform:translateX(-50%);background:#17233b;color:#fff;padding:12px 20px;border-radius:12px;box-shadow:0 12px 30px rgba(0,0,0,.25);z-index:100;font-weight:600;max-width:90vw;text-align:center";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.opacity = "1";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.style.opacity = "0"; }, 2600);
}

/* ---------------- navigation ---------------- */
function updateProgress() {
  const pct = Math.round(((currentStep + 1) / steps.length) * 100);
  progressFill.style.width = pct + "%";
  progressPct.textContent = pct + "%";
  progressLabel.textContent = `שלב ${currentStep + 1} מתוך ${steps.length} · ${STEP_TITLES[currentStep]}`;
}
function goToStep(n) {
  currentStep = Math.max(0, Math.min(LAST_STEP, n));
  steps.forEach((s) => { s.hidden = Number(s.dataset.step) !== currentStep; });
  btnBack.hidden = currentStep === 0;
  const onLast = currentStep === LAST_STEP;
  btnNext.hidden = onLast;
  finalActions.hidden = !onLast;
  if (onLast) renderContractPreview();
  updateProgress();
  window.scrollTo({ top: 0, behavior: "smooth" });
}
function validateStep0() {
  let ok = true, firstBad = null;
  REQUIRED_STEP0.forEach(([name]) => {
    const el = form.elements[name];
    const bad = !el || !String(el.value || "").trim();
    if (el) el.classList.toggle("invalid", bad);
    if (bad && !firstBad) firstBad = el;
    if (bad) ok = false;
  });
  if (!ok) {
    toast("יש למלא שם, תעודת זהות ודואר אלקטרוני.");
    if (firstBad) firstBad.focus();
  }
  return ok;
}

/* ---------------- contract HTML (also the PDF) ----------------
   Uses inline styles + tables only (no CSS Grid, no overflow:hidden, no CSS
   variables). This renders identically in html2canvas, which otherwise clips
   grid/overflow layouts and produced a header-only PDF. */
function buildContractHtml() {
  const d = getFormData();
  const name = d.contractEmployeeName || "";
  const NAVY = "#123a6b", TEAL = "#17b0c4", INK = "#111827", MUTED = "#64748b",
    BODY = "#26324a", LINE = "#e5e9f0", DOT = "#cbd5e1", SIGN = "#94a3b8";

  const metaCell = (label, val) => `<td style="padding:7px 4px;vertical-align:top;width:50%">`
    + `<div style="font-size:11px;color:${MUTED};font-weight:600">${escapeHtml(label)}</div>`
    + `<div style="font-size:13px;color:${INK};border-bottom:1px dotted ${DOT};min-height:17px">${valueOrLine(val)}</div></td>`;
  const metaRows = [
    ["תאריך חתימה", d.contractDate, "שם העובד/ת", name],
    ["מספר זהות", d.contractEmployeeId, "כתובת", d.contractEmployeeAddress],
    ["תפקיד", d.contractRole, "מסגרת / מקום עבודה", d.contractBranch],
    ["ממונה ישיר/ה", d.directManager, "שכר לשעה", d.hourlyWage ? d.hourlyWage + " ₪" : ""]
  ].map((r) => `<tr>${metaCell(r[0], r[1])}${metaCell(r[2], r[3])}</tr>`).join("");

  const clause = (t, b) => `<div style="margin-top:13px">`
    + `<div style="font-size:14px;font-weight:700;color:${NAVY};margin-bottom:3px">${escapeHtml(t)}</div>`
    + `<div style="font-size:12.5px;color:${BODY};line-height:1.6">${b}</div></div>`;
  const clauses = [
    ["מהות התפקיד", `העובד/ת יועסק/ת בתפקיד ${valueOrLine(d.contractRole)} במסגרת ${valueOrLine(d.contractBranch)} או בכל מסגרת אחרת שתיקבע על ידי החברה בהתאם לצורכי העבודה.`],
    ["תקופת ההעסקה", `תקופת ההסכם תחל ביום ${valueOrLine(d.contractStartDate)} ותסתיים ביום ${valueOrLine(d.contractEndDate)}, אלא אם יוסכם אחרת בכתב או בהתאם לדין.`],
    ["היקף עבודה", `ימי העבודה יהיו ${valueOrLine(d.workDays)} ושעות העבודה יהיו ${valueOrLine(d.workHours)}. היקף המשרה: ${valueOrLine(d.positionScope)}.`],
    ["שכר ותשלום", `השכר יהיה ${formatMoney(d.hourlyWage)} לשעה, וישולם ${valueOrLine(d.payFrequency)} בכפוף לדיווחי נוכחות, הוראות הדין וניכויי חובה.`],
    ["נסיעות ותנאים סוציאליים", `דמי נסיעות: ${valueOrLine(d.travelTerms)}. הפרשות פנסיוניות: ${valueOrLine(d.pensionTerms)}.`],
    ["הודעה מוקדמת ותקופת ניסיון", `הודעה מוקדמת: ${valueOrLine(d.noticeTerms)}. תקופת ניסיון: ${valueOrLine(d.trialPeriod)}.`],
    ["נהלים וסודיות", `העובד/ת מתחייב/ת לפעול בהתאם להוראות החברה, לשמור על סודיות, פרטיות ובטיחות, ולהימנע ממסירת מידע על ילדים, הורים, עובדים או פעילות החברה לצד שלישי.`]
  ].map(([t, b]) => clause(t, b)).join("");

  const checks = [
    ["שמירת סודיות ופרטיות", d.contractConfidentiality],
    ["נהלי בטיחות ומשמעת", d.contractSafety],
    ["מסירת מסמכי קליטה", d.contractDocuments],
    ["שימוש בפרטים לצורכי שכר ומס", d.contractTaxConsent]
  ].map(([l, v]) => `<div style="font-size:12.5px;color:${BODY};margin:2px 0">${yesNo(v)} ${escapeHtml(l)}</div>`).join("");

  const bankCell = (label, val) => `<td style="padding:6px 4px;vertical-align:top;width:33.33%">`
    + `<div style="font-size:11px;color:${MUTED};font-weight:600">${escapeHtml(label)}</div>`
    + `<div style="font-size:13px;color:${INK};border-bottom:1px dotted ${DOT};min-height:17px">${valueOrLine(val)}</div></td>`;
  const bankRows = `<tr>${bankCell("שם הבנק", d.bankName)}${bankCell("מספר בנק", d.bankNumber)}${bankCell("מספר סניף", d.branchNumber)}</tr>`
    + `<tr>${bankCell("מספר חשבון", d.accountNumber)}${bankCell("בעל/ת החשבון", d.accountHolder)}<td></td></tr>`;

  const sign = (val, label) => `<td style="width:33.33%;text-align:center;padding:0 10px;vertical-align:bottom">`
    + `<div style="min-height:20px;border-bottom:1px solid ${SIGN};margin-bottom:5px">${valueOrLine(val)}</div>`
    + `<div style="font-size:11px;color:${MUTED};font-weight:600">${escapeHtml(label)}</div></td>`;

  return `<div style="width:100%;background:#fff;color:${INK};font-family:Arial,'Noto Sans Hebrew',sans-serif" dir="rtl">`
    + `<div style="background:linear-gradient(135deg,${NAVY},${TEAL});color:#fff;padding:22px 24px;text-align:center">`
      + `<div style="font-weight:800;letter-spacing:.3px">אמיתי לוי יזמות בע"מ</div>`
      + `<div style="font-size:24px;font-weight:800;margin:6px 0 3px">חוזה עבודה אישי</div>`
      + `<div style="opacity:.9;font-size:13px">גננת / סייעת / מדריך/ה</div></div>`
    + `<div style="padding:14px 24px 20px">`
      + `<table style="width:100%;border-collapse:collapse;border-bottom:1px solid ${LINE};margin-bottom:6px">${metaRows}</table>`
      + clauses
      + `<div style="margin-top:14px"><div style="font-size:14px;font-weight:700;color:${NAVY};margin-bottom:4px">הצהרות וסעיפים מיוחדים</div>${checks}</div>`
      + `<div style="margin-top:14px"><div style="font-size:14px;font-weight:700;color:${NAVY};margin-bottom:3px">הערות מיוחדות</div><div style="font-size:12.5px;color:${BODY}">${escapeHtml(d.contractNotes || "אין הערות מיוחדות.")}</div></div>`
      + `<div style="margin-top:14px"><div style="font-size:14px;font-weight:700;color:${NAVY};margin-bottom:4px">פרטי בנק לתשלום שכר</div>`
        + `<table style="width:100%;border-collapse:collapse">${bankRows}</table></div>`
      + `<table style="width:100%;border-collapse:collapse;border-top:1px solid ${LINE};margin-top:18px"><tr style="vertical-align:bottom">${sign(d.employeeSignatureName || name, "חתימת העובד/ת")}${sign(d.companySignatureName, "חתימת נציג/ת החברה")}${sign(d.contractDate, "תאריך")}</tr></table>`
    + `</div></div>`;
}
function renderContractPreview() {
  if (contractPreview) contractPreview.innerHTML = buildContractHtml();
}

/* ---------------- submit ----------------
   The contract PDF is generated server-side (headless Chromium) from the form
   data, so the client just submits the data. */
async function submitContract(button) {
  saveDraft(true);
  const data = getFormData();
  if (!data.contractEmployeeName || !data.contractEmployeeId || !data.email) {
    goToStep(0);
    validateStep0();
    return;
  }
  const original = button.textContent;
  button.disabled = true;
  button.textContent = "מכין חוזה ושולח...";
  try {
    const response = await fetch("/api/contract-submissions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: "contract-onboarding-web", formData: data })
    });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.error || "שמירה נכשלה");
    toast(`נשלח בהצלחה! מספר קליטה: ${result.submissionId}`);
    alert(`נשמר ונשלח בהצלחה.\nעותק החוזה נשלח למייל: ${data.email}\nמספר קליטה: ${result.submissionId}`);
  } catch (error) {
    alert(`שליחה נכשלה.\n\n${error.message}`);
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

/* ---------------- print ---------------- */
function printContract() {
  renderContractPreview();
  const summary = steps[LAST_STEP];
  summary.setAttribute("data-print", "true");
  window.print();
  setTimeout(() => summary.removeAttribute("data-print"), 500);
}

/* ---------------- wiring ---------------- */
btnNext.addEventListener("click", () => {
  if (currentStep === 0 && !validateStep0()) return;
  saveDraft(true);
  goToStep(currentStep + 1);
});
btnBack.addEventListener("click", () => goToStep(currentStep - 1));
document.getElementById("saveDraft").addEventListener("click", () => saveDraft(false));
document.getElementById("clearDraft").addEventListener("click", clearDraft);
document.getElementById("printPdf").addEventListener("click", printContract);
document.getElementById("submitCloud").addEventListener("click", (e) => submitContract(e.currentTarget));
form.addEventListener("input", () => saveDraft(true));

/* ---------------- init ---------------- */
try {
  fillForm(JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"));
} catch (_) {
  localStorage.removeItem(STORAGE_KEY);
}
goToStep(0);
