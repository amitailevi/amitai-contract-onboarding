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

/* ---------------- contract HTML (also the PDF) ---------------- */
function buildContractHtml() {
  const d = getFormData();
  const employeeName = d.contractEmployeeName || "";
  const clauses = [
    ["מהות התפקיד", `העובד/ת יועסק/ת בתפקיד ${valueOrLine(d.contractRole)} במסגרת ${valueOrLine(d.contractBranch)} או בכל מסגרת אחרת שתיקבע על ידי החברה בהתאם לצורכי העבודה.`],
    ["תקופת ההעסקה", `תקופת ההסכם תחל ביום ${valueOrLine(d.contractStartDate)} ותסתיים ביום ${valueOrLine(d.contractEndDate)}, אלא אם יוסכם אחרת בכתב או בהתאם לדין.`],
    ["היקף עבודה", `ימי העבודה יהיו ${valueOrLine(d.workDays)} ושעות העבודה יהיו ${valueOrLine(d.workHours)}. היקף המשרה: ${valueOrLine(d.positionScope)}.`],
    ["שכר ותשלום", `השכר יהיה ${formatMoney(d.hourlyWage)} לשעה, וישולם ${valueOrLine(d.payFrequency)} בכפוף לדיווחי נוכחות, הוראות הדין וניכויי חובה.`],
    ["נסיעות ותנאים סוציאליים", `דמי נסיעות: ${valueOrLine(d.travelTerms)}. הפרשות פנסיוניות: ${valueOrLine(d.pensionTerms)}.`],
    ["הודעה מוקדמת ותקופת ניסיון", `הודעה מוקדמת: ${valueOrLine(d.noticeTerms)}. תקופת ניסיון: ${valueOrLine(d.trialPeriod)}.`],
    ["נהלים וסודיות", `העובד/ת מתחייב/ת לפעול בהתאם להוראות החברה, לשמור על סודיות, פרטיות ובטיחות, ולהימנע ממסירת מידע על ילדים, הורים, עובדים או פעילות החברה לצד שלישי.`]
  ].map(([t, b]) => `<section><h4>${escapeHtml(t)}</h4><p>${b}</p></section>`).join("");

  const checks = [
    ["שמירת סודיות ופרטיות", d.contractConfidentiality],
    ["נהלי בטיחות ומשמעת", d.contractSafety],
    ["מסירת מסמכי קליטה", d.contractDocuments],
    ["שימוש בפרטים לצורכי שכר ומס", d.contractTaxConsent]
  ].map(([label, v]) => `<span>${yesNo(v)} ${escapeHtml(label)}</span>`).join("");

  const bankRows = [
    ["שם הבנק", d.bankName], ["מספר בנק", d.bankNumber], ["מספר סניף", d.branchNumber],
    ["מספר חשבון", d.accountNumber], ["בעל/ת החשבון", d.accountHolder]
  ].map(([l, v]) => `<div><strong>${escapeHtml(l)}</strong><span>${valueOrLine(v)}</span></div>`).join("");

  return `
    <div class="contract-paper">
      <header>
        <p>אמיתי לוי יזמות בע"מ</p>
        <h3>חוזה עבודה אישי</h3>
        <small>גננת / סייעת / מדריך/ה</small>
      </header>
      <div class="contract-meta">
        <div><strong>תאריך חתימה</strong><span>${valueOrLine(d.contractDate)}</span></div>
        <div><strong>שם העובד/ת</strong><span>${valueOrLine(employeeName)}</span></div>
        <div><strong>מספר זהות</strong><span>${valueOrLine(d.contractEmployeeId)}</span></div>
        <div><strong>כתובת</strong><span>${valueOrLine(d.contractEmployeeAddress)}</span></div>
        <div><strong>תפקיד</strong><span>${valueOrLine(d.contractRole)}</span></div>
        <div><strong>מסגרת / מקום עבודה</strong><span>${valueOrLine(d.contractBranch)}</span></div>
        <div><strong>ממונה ישיר/ה</strong><span>${valueOrLine(d.directManager)}</span></div>
        <div><strong>שכר לשעה</strong><span>${formatMoney(d.hourlyWage)}</span></div>
      </div>
      <div class="contract-body">
        ${clauses}
        <section>
          <h4>הצהרות וסעיפים מיוחדים</h4>
          <div class="contract-checks">${checks}</div>
        </section>
        <section>
          <h4>הערות מיוחדות</h4>
          <p>${escapeHtml(d.contractNotes || "אין הערות מיוחדות.")}</p>
        </section>
        <section>
          <h4>פרטי בנק לתשלום שכר</h4>
          <div class="contract-meta" style="padding:8px 0;border:none">${bankRows}</div>
        </section>
      </div>
      <footer class="contract-signatures">
        <div><span>${valueOrLine(d.employeeSignatureName || employeeName)}</span><strong>חתימת העובד/ת</strong></div>
        <div><span>${valueOrLine(d.companySignatureName)}</span><strong>חתימת נציג/ת החברה</strong></div>
        <div><span>${valueOrLine(d.contractDate)}</span><strong>תאריך</strong></div>
      </footer>
    </div>`;
}
function renderContractPreview() {
  if (contractPreview) contractPreview.innerHTML = buildContractHtml();
}

/* ---------------- PDF ---------------- */
async function generateContractPdf(idNumber) {
  if (typeof html2pdf === "undefined") return [];
  renderContractPreview();

  const clip = document.createElement("div");
  clip.className = "pdf-clip";
  const stage = document.createElement("div");
  stage.className = "pdf-stage";
  clip.appendChild(stage);
  document.body.appendChild(clip);

  const opts = {
    margin: 0,
    image: { type: "jpeg", quality: 0.95 },
    html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff", logging: false },
    jsPDF: { unit: "pt", format: "a4", orientation: "portrait" },
    pagebreak: { mode: ["css", "legacy"] }
  };

  try {
    const el = document.createElement("div");
    el.innerHTML = buildContractHtml();
    stage.appendChild(el);
    // Run the full pipeline before reading bytes so the PDF is never blank.
    const pdf = await html2pdf().set(opts).from(el).toContainer().toCanvas().toImg().toPdf().get("pdf");
    const dataUri = pdf.output("datauristring");
    return [{ filename: `Contract-${idNumber || "employee"}.pdf`, contentBase64: String(dataUri).split(",")[1] }];
  } finally {
    document.body.removeChild(clip);
  }
}

/* ---------------- submit ---------------- */
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
    let attachments = [];
    try {
      attachments = await generateContractPdf(data.contractEmployeeId);
    } catch (e) {
      console.error("PDF generation failed, submitting without attachment:", e);
    }
    const response = await fetch("/api/contract-submissions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: "contract-onboarding-web", formData: data, attachments })
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
