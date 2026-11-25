import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { initMailer, sendEmail } from "../mailer.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

console.log("🔍 Verifying Email Configuration...");
console.log(`User: ${process.env.EMAIL_USER}`);
console.log(`Host: ${process.env.EMAIL_HOST}`);

async function run() {
  initMailer();

  console.log("📨 Attempting to send test email...");
  await sendEmail({
    to: process.env.EMAIL_USER,
    subject: "Direct Terminal Test",
    text: "If you see this, your .env configuration is correct!",
    html: "<h1>It Works!</h1><p>Sent from verify-email.js</p>",
  });

  console.log("✅ Done. Check your inbox.");
}

run().catch(console.error);
