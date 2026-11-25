import { APP_URL, DB_FILE } from "./config.js";
import { readDB, updateDB } from "./db.js";
import { escapeHtml, sendEmail } from "./mailer.js";

const REMINDER_THRESHOLD_MINUTES = 30;
const COOLDOWN_MS = 2 * 60 * 60 * 1000;
const EMAIL_BATCH_SIZE = 3;

async function sendReminderForItem(item, diffMinutes, sendEmailFn) {
  const safeService = escapeHtml(item.service);
  await sendEmailFn({
    to: item.email,
    subject: `⏳ ${diffMinutes} mins left — ${item.service}`,
    text: `Your task "${item.service}" expires in ${diffMinutes} minutes.`,
    html: `
      <div style="font-family:sans-serif;padding:20px">
        <h2>⏰ Deadline Approaching</h2>
        <p><strong>${safeService}</strong></p>
        <p>${diffMinutes} minutes remaining</p>
        <a href="${escapeHtml(APP_URL)}"
           style="padding:10px 16px;background:#6366f1;color:white;text-decoration:none;border-radius:8px;display:inline-block">
          Submit Proof
        </a>
      </div>
    `,
  });
  return item.mintAddress;
}

/**
 * Scans pending commitments and sends deadline reminder emails in bounded batches.
 */
export async function runReminderCheck(
  dbPath = DB_FILE,
  { sendEmailFn = sendEmail, now = new Date() } = {}
) {
  const snapshot = readDB(dbPath);
  const due = [];

  for (const item of snapshot) {
    if (!item.email || item.status !== "PENDING" || !item.renewalDate) continue;

    const deadline = new Date(item.renewalDate);
    const diffMinutes = Math.floor((deadline - now) / 60000);
    if (diffMinutes <= 0 || diffMinutes > REMINDER_THRESHOLD_MINUTES) continue;

    const alreadyNotifiedRecently =
      item.lastNotified &&
      now - new Date(item.lastNotified) < COOLDOWN_MS;
    if (alreadyNotifiedRecently) continue;

    due.push({ item, diffMinutes });
  }

  if (due.length === 0) return;

  const notifiedMints = [];
  for (let i = 0; i < due.length; i += EMAIL_BATCH_SIZE) {
    const batch = due.slice(i, i + EMAIL_BATCH_SIZE);
    const settled = await Promise.allSettled(
      batch.map(({ item, diffMinutes }) => {
        console.log(
          `🔔 Sending reminder: ${item.service} (${diffMinutes} mins left)`
        );
        return sendReminderForItem(item, diffMinutes, sendEmailFn);
      })
    );

    for (let j = 0; j < settled.length; j++) {
      const outcome = settled[j];
      if (outcome.status === "fulfilled") {
        notifiedMints.push(outcome.value);
      } else {
        console.error(
          `Failed reminder email for ${batch[j].item.mintAddress}:`,
          outcome.reason?.message || outcome.reason
        );
      }
    }
  }

  if (notifiedMints.length > 0) {
    const timestamp = now.toISOString();
    const notifiedSet = new Set(notifiedMints);
    await updateDB((latestDb) => {
      for (const record of latestDb) {
        if (notifiedSet.has(record.mintAddress)) {
          record.lastNotified = timestamp;
        }
      }
      return latestDb;
    }, dbPath);
  }
}
