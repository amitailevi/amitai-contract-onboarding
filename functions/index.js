const admin = require("firebase-admin");
const cors = require("cors");
const express = require("express");
const functions = require("firebase-functions");
const nodemailer = require("nodemailer");

admin.initializeApp();

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: "15mb" }));

function requireField(data, key, label) {
  if (!data[key]) {
    const error = new Error(`חסר שדה חובה: ${label}`);
    error.status = 400;
    throw error;
  }
}

function createTransport() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: { user, pass }
  });
}

async function sendContractCopy({ email, fullName, submissionId, attachments }) {
  const subject = "חוזה העסקה - אמיתי לוי יזמות בע\"מ";
  const text = `שלום ${fullName || ""},\n\n`
    + `תודה על מילוי טופס הקליטה. מצורף למייל זה חוזה העבודה כפי שמילאת.\n`
    + `יש לבדוק את הפרטים ולשמור עותק. לכל שאלה ניתן להשיב למייל זה.\n\n`
    + `בברכה,\nאמיתי לוי יזמות בע"מ`;

  // Build PDF attachments (contract) from base64 sent by the client.
  const mailAttachments = (Array.isArray(attachments) ? attachments : [])
    .filter((a) => a && a.contentBase64 && a.filename)
    .map((a) => ({
      filename: a.filename,
      content: Buffer.from(a.contentBase64, "base64"),
      contentType: "application/pdf"
    }));

  async function queueMail(status, extra) {
    // Attachments are intentionally NOT stored (Firestore 1MB doc limit).
    await admin.firestore().collection("mailQueue").add(Object.assign({
      to: email,
      subject,
      text,
      submissionId,
      attachmentCount: mailAttachments.length,
      status,
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
      to: email,
      subject,
      text,
      attachments: mailAttachments
    });
    return { sent: true, queued: false, attachmentCount: mailAttachments.length };
  } catch (error) {
    // Never let a mail failure fail the submission — record it for later retry.
    console.error("sendContractCopy failed:", error);
    await queueMail("send_failed", { error: error.message || String(error) });
    return { sent: false, queued: true, error: error.message || String(error) };
  }
}

app.post("/api/contract-submissions", async (req, res) => {
  try {
    const body = req.body || {};
    const formData = body.formData || {};

    requireField(formData, "contractEmployeeName", "שם העובד/ת בחוזה");
    requireField(formData, "contractEmployeeId", "מספר תעודת זהות");
    requireField(formData, "email", "דואר אלקטרוני");

    const fullName = formData.contractEmployeeName || "";
    const now = admin.firestore.FieldValue.serverTimestamp();

    const submissionRef = admin.firestore().collection("contractSubmissions").doc();
    await submissionRef.set({
      submissionId: submissionRef.id,
      fullName,
      email: formData.email,
      idNumberMasked: String(formData.contractEmployeeId || "").slice(-4)
        ? `***${String(formData.contractEmployeeId).slice(-4)}`
        : "",
      source: body.source || "contract-onboarding-web",
      status: "submitted",
      formData,
      createdAt: now,
      updatedAt: now
    });

    const mailResult = await sendContractCopy({
      email: formData.email,
      fullName,
      submissionId: submissionRef.id,
      attachments: Array.isArray(body.attachments) ? body.attachments : []
    });

    res.json({
      ok: true,
      submissionId: submissionRef.id,
      mail: mailResult
    });
  } catch (error) {
    console.error(error);
    res.status(error.status || 500).json({
      ok: false,
      error: error.message || "Internal server error"
    });
  }
});

exports.api = functions
  .runWith({ secrets: ["SMTP_PASS"] })
  .https.onRequest(app);
