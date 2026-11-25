import nodemailer from "nodemailer";

let transporter;

const EMAIL_REGEX = /^[^\s@<>,;"'\\]+@[^\s@<>,;"'\\]+\.[^\s@<>,;"'\\]{2,}$/;

export function isValidEmail(email) {
  if (typeof email !== "string") return false;
  const trimmed = email.trim();
  if (trimmed.length === 0 || trimmed.length > 254) return false;
  if (/[\r\n\0]/.test(email)) return false;
  return EMAIL_REGEX.test(trimmed);
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function sanitizeHeader(value) {
  return String(value ?? "").replace(/[\r\n\0]+/g, " ").trim();
}

export function initMailer() {
  if (transporter) return transporter;

  transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: Number(process.env.EMAIL_PORT),
    secure: false,
    disableFileAccess: true,
    disableUrlAccess: true,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  console.log("📧 Mailer initialized");
  return transporter;
}

export async function sendEmail({ to, subject, html, text, icalEvent }) {
  if (!isValidEmail(to)) {
    throw new Error("Invalid recipient email address");
  }

  if (!transporter) initMailer();

  const opts = {
    from: process.env.EMAIL_FROM,
    to: sanitizeHeader(to),
    subject: sanitizeHeader(subject),
    text,
    html,
  };

  if (icalEvent) {
    opts.icalEvent = {
      filename: "commitment.ics",
      method: "request",
      content: icalEvent,
    };
  }

  return transporter.sendMail(opts);
}

export function generateICal({ service, start, end, description, url }) {
  const formatDate = (date) =>
    date.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const now = formatDate(new Date());

  return `
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Protocol.Commit//NONSGML v1.0//EN
BEGIN:VEVENT
UID:${Date.now()}@protocol.commit
DTSTAMP:${now}
DTSTART:${formatDate(new Date(start))}
DTEND:${formatDate(new Date(end))}
SUMMARY:${sanitizeHeader(service)} (Protocol.Commit)
DESCRIPTION:${sanitizeHeader(description)}
URL:${sanitizeHeader(url)}
STATUS:CONFIRMED
BEGIN:VALARM
TRIGGER:-PT15M
ACTION:DISPLAY
DESCRIPTION:Reminder
END:VALARM
END:VEVENT
END:VCALENDAR
`.trim();
}
